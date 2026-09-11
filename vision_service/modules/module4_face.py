from fastapi import APIRouter, UploadFile, File, HTTPException
import cv2
import numpy as np
from deepface import DeepFace

router = APIRouter()

@router.post("/verify-face")
async def verify_face(
    document_image: UploadFile = File(...),
    live_image: UploadFile = File(...)
):
    """
    Verifies that the face in the document matches the live photo.
    Uses DeepFace with RetinaFace backend.
    """
    # Read bytes and decode into OpenCV format
    doc_bytes = await document_image.read()
    live_bytes = await live_image.read()
    
    doc_img = cv2.imdecode(np.frombuffer(doc_bytes, np.uint8), cv2.IMREAD_COLOR)
    live_img = cv2.imdecode(np.frombuffer(live_bytes, np.uint8), cv2.IMREAD_COLOR)
    
    try:
        # We set enforce_detection to False in case the document image is cropped weirdly
        result = DeepFace.verify(
            img1_path=doc_img, 
            img2_path=live_img, 
            detector_backend="retinaface", 
            enforce_detection=False
        )
        return {
            "success": True, 
            "match": result["verified"], 
            "distance": result["distance"], 
            "threshold": result["threshold"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Face verification failed: {str(e)}")
