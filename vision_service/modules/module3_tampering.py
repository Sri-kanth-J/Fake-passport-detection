from fastapi import APIRouter, UploadFile, File, HTTPException
import cv2
import numpy as np

router = APIRouter()

@router.post("/tampering")
async def check_tampering(document_image: UploadFile = File(...)):
    """
    Checks for image tampering using Error Level Analysis (ELA).
    This compares the original image to a re-compressed JPEG version
    to highlight areas that may have been edited (e.g. pasted text/photos).
    """
    doc_bytes = await document_image.read()
    img = cv2.imdecode(np.frombuffer(doc_bytes, np.uint8), cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="Invalid image file.")

    try:
        # Perform basic ELA
        # 1. Save image at a known quality
        TEMP_QUALITY = 90
        _, encoded_img = cv2.imencode('.jpg', img, [cv2.IMWRITE_JPEG_QUALITY, TEMP_QUALITY])
        
        # 2. Decode the compressed image
        compressed_img = cv2.imdecode(encoded_img, cv2.IMREAD_COLOR)
        
        # 3. Calculate absolute difference
        diff = cv2.absdiff(img, compressed_img)
        
        # 4. Enhance the difference to make it visible
        # We calculate the max difference to scale the values
        max_diff = np.max(diff)
        if max_diff == 0:
            scale = 1.0
        else:
            scale = 255.0 / max_diff
            
        ela_image = cv2.convertScaleAbs(diff, alpha=scale)
        
        # Calculate a simple "tampering score" based on the variance of the ELA
        # High variance often indicates localized editing (pasted sections)
        gray_ela = cv2.cvtColor(ela_image, cv2.COLOR_BGR2GRAY)
        score = np.var(gray_ela)
        
        # A very basic threshold heuristic for the demo
        is_tampered = score > 1500.0
        
        return {
            "success": True,
            "tampered": bool(is_tampered),
            "score": float(score),
            "threshold": 1500.0,
            "message": "Potential tampering detected in document." if is_tampered else "Document image appears consistent."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tampering check failed: {str(e)}")
