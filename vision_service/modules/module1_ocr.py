import io
from fastapi import APIRouter, UploadFile, File, HTTPException
from passporteye import read_mrz

router = APIRouter()

@router.post("/extract")
async def extract_document_data(file: UploadFile = File(...)):
    """
    Extracts MRZ data from the uploaded document image entirely in memory.
    No images are persisted to disk.
    """
    if not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files are accepted.")

    # Read image into memory
    image_bytes = await file.read()
    
    try:
        # Pass bytes via io.BytesIO to read_mrz
        # read_mrz can accept a stream or file path
        mrz = read_mrz(io.BytesIO(image_bytes))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR processing failed: {str(e)}")

    if mrz is None:
        return {"success": False, "error": "No MRZ found in the image."}
        
    mrz_data = mrz.to_dict()
    
    # We map the PassportEye dict fields to match what our frontend expects
    # e.g., mrz_data contains: names, surname, number, nationality, date_of_birth, expiration_date, sex
    return {
        "success": True,
        "mrz_raw": mrz.mrz.text,
        "fields": {
            "name": f"{mrz_data.get('names', '')} {mrz_data.get('surname', '')}".strip(),
            "documentNumber": mrz_data.get("number"),
            "nationality": mrz_data.get("nationality"),
            "dateOfBirth": mrz_data.get("date_of_birth"),
            "dateOfExpiry": mrz_data.get("expiration_date"),
            "sex": mrz_data.get("sex"),
            "documentType": mrz_data.get("type"),
        }
    }
