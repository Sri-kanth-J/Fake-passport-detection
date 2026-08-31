import os
import re
import easyocr
from mrz.checker.td3 import TD3CodeChecker
from mrz.checker.td2 import TD2CodeChecker
from mrz.checker.td1 import TD1CodeChecker

# Initialize the EasyOCR reader (downloads model on first run if not present)
reader = easyocr.Reader(['en'], gpu=False)

# --- Regex Extractors ---
AADHAAR_REGEX = re.compile(r'\b\d{4}\s?\d{4}\s?\d{4}\b')
PAN_REGEX = re.compile(r'\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b')
DL_REGEX = re.compile(r'\b[A-Z]{2}[0-9]{2}[A-Z0-9\s]{1,13}\b') # MH12 20110012345
VOTER_ID_REGEX = re.compile(r'\b[A-Z]{3}[0-9]{7}\b')

def extract_text(image_path: str):
    """Extracts text from the image using EasyOCR."""
    results = reader.readtext(image_path)
    extracted = [text for (bbox, text, prob) in results if prob > 0.4]
    return extracted

def parse_mrz(text_lines):
    """Attempts to find and parse MRZ lines from extracted text."""
    mrz_candidates = [line.replace(' ', '').upper() for line in text_lines if '<' in line]
    
    if len(mrz_candidates) >= 2:
        potential_mrz = "\n".join(mrz_candidates[-2:])
        try:
            td3_check = TD3CodeChecker(potential_mrz)
            if td3_check:
                fields = td3_check.fields()
                return {
                    "mrz_valid": True,
                    "type": "Passport",
                    "extracted_fields": {
                        "document_number": fields.document_number,
                        "nationality": fields.nationality,
                        "dob": fields.birth_date,
                        "expiry": fields.expiry_date,
                        "sex": fields.sex
                    }
                }
        except Exception:
            pass

    return None # Return None if not MRZ, so we can run domestic KYC checks

def extract_domestic_kyc(text_lines):
    """
    Classifies domestic Indian KYC and educational marksheets 
    and extracts key ID numbers via Regex.
    """
    full_text = " ".join(text_lines)
    full_text_upper = full_text.upper()
    
    result = {
        "mrz_valid": False, # Domestic IDs don't have MRZ
        "type": "Unknown Document",
        "extracted_fields": {}
    }
    
    # 1. Aadhaar Card
    if "AADHAAR" in full_text_upper or "GOVERNMENT OF INDIA" in full_text_upper:
        result["type"] = "Aadhaar Card"
        match = AADHAAR_REGEX.search(full_text)
        if match: result["extracted_fields"]["aadhaar_number"] = match.group(0).replace(" ", "")
            
    # 2. PAN Card
    elif "INCOME TAX DEPARTMENT" in full_text_upper or "PERMANENT ACCOUNT NUMBER" in full_text_upper or "INCOME TAX" in full_text_upper:
        result["type"] = "PAN Card"
        match = PAN_REGEX.search(full_text_upper)
        if match: result["extracted_fields"]["pan_number"] = match.group(0)
            
    # 3. Driving License
    elif "DRIVING LICENCE" in full_text_upper or "TRANSPORT DEPARTMENT" in full_text_upper:
        result["type"] = "Driving License"
        match = DL_REGEX.search(full_text_upper)
        if match: result["extracted_fields"]["dl_number"] = match.group(0).replace(" ", "")
            
    # 4. Voter ID
    elif "ELECTION COMMISSION" in full_text_upper or "ELECTOR PHOTO IDENTITY CARD" in full_text_upper:
        result["type"] = "Voter ID"
        match = VOTER_ID_REGEX.search(full_text_upper)
        if match: result["extracted_fields"]["voter_epic"] = match.group(0)
            
    # 5. Educational Marksheet
    elif "BOARD OF SECONDARY EDUCATION" in full_text_upper or "UNIVERSITY" in full_text_upper or "STATEMENT OF MARKS" in full_text_upper or "PASSING CERTIFICATE" in full_text_upper:
        result["type"] = "Educational Marksheet"
        # Try to find Roll No and Year
        roll_match = re.search(r'(?i)roll\s*no[\s\.:]*(\w+)', full_text)
        year_match = re.search(r'\b(19|20)\d{2}\b', full_text)
        
        if roll_match: result["extracted_fields"]["roll_number"] = roll_match.group(1)
        if year_match: result["extracted_fields"]["passing_year"] = year_match.group(0)
            
    # Fallback to Nepali Citizenship if detected (from original requirement)
    elif "NEPAL" in full_text_upper and "CITIZENSHIP" in full_text_upper:
        result["type"] = "Nepali Citizenship Card"
        
    if not result["extracted_fields"]:
         result["extracted_fields"]["raw_preview"] = text_lines[:3]
         
    return result

def analyze_document_text(image_path: str):
    text_lines = extract_text(image_path)
    
    # 1. Try MRZ (Passport / Visa) First
    mrz_result = parse_mrz(text_lines)
    if mrz_result:
        return mrz_result
        
    # 2. If no MRZ, process as a domestic/local KYC document
    return extract_domestic_kyc(text_lines)
