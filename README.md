# Fake Passport Detection

This project combines a backend document verification system with a frontend interface for reviewing uploaded identity documents. It is designed to detect forged or tampered passports and other identity documents using OCR, image analysis, and face matching.

## Project Purpose

The application checks:

- document type and extracted text
- visual tampering or altered content
- face matching against a known database
- overall risk level for the submitted document

## Repository Structure

- `backend/` – FastAPI service, AI modules, model logic, and verification pipeline
- `frontend/` – Vite + React interface for uploading documents and viewing results

## Documentation

For more details, see:

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)

## Quick Start

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

This project is intended as a working prototype and demonstration of the end-to-end document verification workflow.
