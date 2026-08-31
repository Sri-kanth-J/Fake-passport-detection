# SSB Document Verification API

This project is a backend system for verifying identity documents by combining OCR, tamper detection, and face verification. It exposes a FastAPI-based API that takes a document image, analyzes it, and returns a risk assessment.

## Project Purpose

The app is designed to process uploaded document images and detect:

- whether the document is a passport, Aadhaar, PAN, driving license, voter ID, or other document type
- whether the document text is valid and readable
- whether the document appears tampered using image analysis
- whether the document matches a face database or a live face
- whether the overall risk is low, medium, or high

## Main Features

- OCR-based document text extraction using EasyOCR
- MRZ parsing for passports
- Domestic ID classification with regex-based document extraction
- Tampering detection with ELA and a trained MobileNetV2 CNN model
- Face verification with DeepFace
- Risk scoring logic and audit logging
- File upload API endpoints

## Project Structure

- `main.py` – FastAPI app and document verification workflow
- `ai_modules/ocr_service.py` – OCR + document classification logic
- `ai_modules/tamper_service.py` – tamper detection using ELA/CNN
- `ai_modules/face_service.py` – facial matching logic
- `requirements.txt` – project dependencies
- `generate_dataset.py` / `generate_tamper_dataset.py` – synthetic dataset generation
- `train_tamper_model.py` – tamper model training
- `mock_face_db/` – local face database used for demo 1:N matching
- `tamper_dataset/` – training data folders
- `audit_log.jsonl` – verification events log

## API Endpoints

### Root

- `GET /`
- Returns service status

### Health check

- `GET /health`
- Returns app health, tamper model status, face database size, and CUDA status

### Audit log

- `GET /api/audit-log`
- Returns recent verification records

### Enroll face

- `POST /api/enroll-face`
- Uploads a face image and stores it in the local database

### Verify document

- `POST /api/verify-document`
- Uploads a document image and returns OCR, tamper, face, and risk results

## How the App Works

1. A document image is uploaded via the API.
2. OCR extracts text and identifies the document type.
3. Passport MRZ is checked if present; otherwise local ID patterns are matched.
4. ELA and a CNN model detect tampering.
5. Face matching is performed against the local face database.
6. A risk score is computed and logged.
7. The result is returned in JSON.

## Setup

Install dependencies:

```bash
pip install -r requirements.txt
```

Run the app:

```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Notes

This project is a working proof-of-concept or prototype backend. It demonstrates the full AI verification pipeline but is not a production-grade deployment by itself. It does not include user authentication, database persistence, or a full frontend UI in the repository.
