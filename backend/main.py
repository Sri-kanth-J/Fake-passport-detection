import os
import json
import shutil
import tempfile
from datetime import datetime
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ai_modules.ocr_service import analyze_document_text
from ai_modules.tamper_service import detect_tampering
from ai_modules.face_service import verify_face

app = FastAPI(title="SSB Document Verification API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FACE_DB_PATH  = os.path.join(os.path.dirname(__file__), "mock_face_db")
AUDIT_LOG     = os.path.join(os.path.dirname(__file__), "audit_log.jsonl")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "SSB Document Verification API v2.0"}

@app.get("/health")
def health():
    from ai_modules.tamper_service import tamper_model
    face_count = len([f for f in os.listdir(FACE_DB_PATH) if f.lower().endswith(('.jpg','.jpeg','.png'))]) if os.path.exists(FACE_DB_PATH) else 0
    return {
        "status":       "ok",
        "tamper_model": "CNN (MobileNetV2)" if tamper_model else "heuristic fallback",
        "face_db_size": face_count,
        "cuda":         __import__("torch").cuda.is_available(),
    }

@app.get("/api/audit-log")
def get_audit_log(limit: int = 20):
    if not os.path.exists(AUDIT_LOG):
        return {"entries": []}
    lines = open(AUDIT_LOG).readlines()
    entries = [json.loads(l) for l in lines[-limit:]]
    return {"entries": list(reversed(entries))}

@app.post("/api/enroll-face")
async def enroll_face(name: str, file: UploadFile = File(...)):
    os.makedirs(FACE_DB_PATH, exist_ok=True)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in name)
    dest = os.path.join(FACE_DB_PATH, f"{safe}.jpg")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)
    # Clear stale DeepFace embedding index so it rebuilds
    stale = os.path.join(FACE_DB_PATH, "representations_vgg_face.pkl")
    if os.path.exists(stale):
        os.remove(stale)
    return {"status": "enrolled", "identity": safe, "path": dest}

def calculate_risk_score(ocr_result, tamper_result, face_result):
    score = 0

    # Tampering is a massive red flag (0-50 points)
    if tamper_result["is_tampered"]:
        score += 50
    score += int(tamper_result["confidence"] * 20)

    # Face watchlist hit is a critical red flag (0-50 points)
    if face_result["1_to_n_flagged"]:
        score += 50

    # Failed 1:1 liveness (0-30 points)
    if not face_result["1_to_1_match"]:
        score += 30

    # MRZ checksum fail for Passports
    if ocr_result["type"] == "Passport" and not ocr_result["mrz_valid"]:
        score += 40

    # Domestic docs lack cryptographic MRZ — baseline scrutiny penalty
    if ocr_result["type"] not in ("Passport", "Unknown Document"):
        score += 15

    # Unknown doc — max suspicion
    if ocr_result["type"] == "Unknown Document":
        score += 45

    score = min(score, 100)

    if score >= 60:
        return {"score": score, "risk_level": "HIGH",   "recommendation": "DETAIN & INVESTIGATE"}
    elif score >= 35:
        return {"score": score, "risk_level": "MEDIUM", "recommendation": "SECONDARY CHECK"}
    else:
        return {"score": score, "risk_level": "LOW",    "recommendation": "APPROVE"}

@app.post("/api/verify-document")
async def verify_document(file: UploadFile = File(...)):
    temp_dir  = tempfile.mkdtemp()
    temp_path = os.path.join(temp_dir, file.filename)

    with open(temp_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        ocr_result    = analyze_document_text(temp_path)
        tamper_result = detect_tampering(temp_path)
        face_result   = verify_face(temp_path, live_image_path=None)
        risk_score    = calculate_risk_score(ocr_result, tamper_result, face_result)

        response = {
            "status":   "success",
            "filename": file.filename,
            "results": {
                "document_classification": {
                    "type":       ocr_result["type"],
                    "confidence": 0.95,
                },
                "ocr":             ocr_result,
                "tamper_detection": tamper_result,
                "face_verification": face_result,
                "risk_score":       risk_score,
            },
        }

        # Append to audit log
        entry = {
            "ts":         datetime.utcnow().isoformat(),
            "filename":   file.filename,
            "doc_type":   ocr_result["type"],
            "tampered":   tamper_result["is_tampered"],
            "risk_level": risk_score["risk_level"],
            "score":      risk_score["score"],
        }
        with open(AUDIT_LOG, "a") as f:
            f.write(json.dumps(entry) + "\n")

        return response

    except Exception as e:
        return {"status": "error", "message": str(e)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
        os.rmdir(temp_dir)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)

