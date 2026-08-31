import cv2
import numpy as np
from PIL import Image, ImageChops, ImageEnhance
import os
import torch
import torch.nn as nn
from torchvision import models, transforms

# Load the CNN model if it exists (trained by train_tamper_model.py)
MODEL_PATH = os.path.join(os.path.dirname(__file__), '..', 'tamper_model.pth')
device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
tamper_model = None

if os.path.exists(MODEL_PATH):
    try:
        tamper_model = models.mobilenet_v2()
        num_ftrs = tamper_model.classifier[1].in_features
        tamper_model.classifier[1] = nn.Linear(num_ftrs, 2) # authentic, tampered
        tamper_model.load_state_dict(torch.load(MODEL_PATH, map_location=device))
        tamper_model = tamper_model.to(device)
        tamper_model.eval()
        print("Successfully loaded trained Tamper CNN model!")
    except Exception as e:
        print(f"Failed to load tamper model: {e}")
        tamper_model = None

# Transforms matching the training pipeline
transform_pipeline = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

def get_ela(image_path: str, quality: int = 90) -> Image.Image:
    """Generates ELA image from a file path."""
    original = Image.open(image_path).convert('RGB')
    temp_filename = "temp_ela.jpg"
    original.save(temp_filename, 'JPEG', quality=quality)
    resaved = Image.open(temp_filename)
    ela_image = ImageChops.difference(original, resaved)
    
    extrema = ela_image.getextrema()
    max_diff = max([ex[1] for ex in extrema])
    if max_diff == 0: max_diff = 1
        
    scale = 255.0 / max_diff
    ela_image = ImageEnhance.Brightness(ela_image).enhance(scale)
    if os.path.exists(temp_filename): os.remove(temp_filename)
    return ela_image

def detect_tampering(image_path: str):
    """
    Analyzes an image and returns a tampering report.
    Uses the trained CNN if available, else falls back to variance heuristic.
    """
    try:
        ela_img = get_ela(image_path)
        
        if tamper_model:
            # Use PyTorch CNN
            input_tensor = transform_pipeline(ela_img).unsqueeze(0).to(device)
            with torch.no_grad():
                outputs = tamper_model(input_tensor)
                probabilities = torch.nn.functional.softmax(outputs, dim=1)[0]
                
            # Assuming class 0 is 'authentic', class 1 is 'tampered'
            tamper_prob = probabilities[1].item()
            is_tampered = tamper_prob > 0.5
            
            return {
                "is_tampered": is_tampered,
                "confidence": round(tamper_prob if is_tampered else probabilities[0].item(), 2),
                "details": f"Deep Learning ELA analysis {'flagged' if is_tampered else 'cleared'} the document."
            }
        else:
            # Fallback heuristic
            ela_np = np.array(ela_img)
            gray = cv2.cvtColor(ela_np, cv2.COLOR_RGB2GRAY)
            variance = np.var(gray)
            normalized_score = min(variance / 2000.0, 1.0)
            is_tampered = bool(normalized_score > 0.6)
            
            return {
                "is_tampered": is_tampered,
                "confidence": round(float(normalized_score), 2),
                "details": "Heuristic ELA analysis used (CNN model not found)."
            }
    except Exception as e:
        return {
            "is_tampered": False,
            "confidence": 0.0,
            "details": f"Analysis failed: {str(e)}"
        }
