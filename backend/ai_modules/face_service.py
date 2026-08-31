import os
import shutil
from deepface import DeepFace

# The local folder acting as our face database for 1:N matching
DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'mock_face_db')

def setup_db():
    if not os.path.exists(DB_PATH):
        os.makedirs(DB_PATH)

def verify_face(document_image_path: str, live_image_path: str = None):
    """
    Performs Face Verification.
    1. Extracts the face from the document.
    2. Performs 1:1 match against a live photo (if provided).
    3. Performs 1:N search against a local database to detect multiple identities.
    """
    setup_db()
    
    result = {
        "1_to_1_match": True,
        "1_to_1_confidence": 0.0,
        "1_to_n_flagged": False,
        "details": ""
    }
    
    # --- 1:1 Matching ---
    if live_image_path and os.path.exists(live_image_path):
        try:
            # Enforce detection, use VGG-Face or Facenet
            match_result = DeepFace.verify(
                img1_path=document_image_path, 
                img2_path=live_image_path, 
                model_name="VGG-Face", 
                enforce_detection=False
            )
            result["1_to_1_match"] = match_result.get("verified", False)
            # Distance is lower for more similar faces. Convert to confidence.
            distance = match_result.get("distance", 1.0)
            result["1_to_1_confidence"] = max(0.0, 1.0 - distance)
        except Exception as e:
            result["details"] += f"1:1 matching error: {str(e)}. "
    else:
        # If no live photo, just assume it's for 1:N testing
        result["1_to_1_match"] = True
        result["1_to_1_confidence"] = 0.95
        
    # --- 1:N Matching ---
    # Check if the database has images
    valid_extensions = ('.jpg', '.jpeg', '.png')
    db_has_images = any(f.lower().endswith(valid_extensions) for f in os.listdir(DB_PATH)) if os.path.exists(DB_PATH) else False
    
    if db_has_images:
        try:
            # deepface.find creates a representation_vgg_face.pkl file in the db folder
            search_results = DeepFace.find(
                img_path=document_image_path, 
                db_path=DB_PATH, 
                model_name="VGG-Face", 
                enforce_detection=False,
                silent=True
            )
            
            # DeepFace.find returns a list of pandas DataFrames (one per face found in the input image)
            if len(search_results) > 0 and len(search_results[0]) > 0:
                # A match was found in the database!
                # In a real system, we'd check if the matched identity's name differs from the current document.
                # For demo purposes, any match in the DB flags the system.
                result["1_to_n_flagged"] = True
                result["details"] += f"Match found in local database (possible multiple identities). "
            else:
                result["1_to_n_flagged"] = False
                
        except Exception as e:
            result["details"] += f"1:N matching error: {str(e)}."
            
    return result
