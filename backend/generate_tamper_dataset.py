import os
import cv2
import numpy as np
from PIL import Image, ImageChops, ImageEnhance, ImageDraw, ImageFilter
import random
from tqdm import tqdm

DATA_DIR  = "tamper_dataset"
TRAIN_DIR = os.path.join(DATA_DIR, "train")
VAL_DIR   = os.path.join(DATA_DIR, "val")
CATEGORIES = ["authentic", "tampered"]

def get_ela(image, quality=90):
    temp = "temp_ela_gen.jpg"
    image.save(temp, "JPEG", quality=quality)
    resaved = Image.open(temp)
    ela = ImageChops.difference(image, resaved)
    extrema = ela.getextrema()
    max_diff = max(ex[1] for ex in extrema) or 1
    ela = ImageEnhance.Brightness(ela).enhance(255.0 / max_diff)
    os.remove(temp)
    return ela

def make_base_document():
    w, h = 800, 500
    # Random document background color (cream, pale blue, white)
    bg = random.choice([240, 245, 250])
    base = np.ones((h, w, 3), dtype=np.uint8) * bg
    noise = np.random.randint(0, 10, (h, w, 3), dtype=np.uint8)
    base = cv2.add(base, noise)

    # Horizontal text lines
    for _ in range(random.randint(4, 8)):
        y    = random.randint(60, 440)
        xend = random.randint(250, 600)
        color = (random.randint(20, 80),) * 3
        cv2.line(base, (50, y), (xend, y), color, random.randint(2, 5))

    # Photo placeholder box (right side)
    px, py = random.randint(480, 550), random.randint(40, 80)
    pw, ph = 200, 250
    face_gray = random.randint(120, 180)
    cv2.rectangle(base, (px, py), (px + pw, py + ph), (face_gray,) * 3, -1)

    # Bottom MRZ-like lines
    for row in range(2):
        y = 440 + row * 18
        cv2.line(base, (30, y), (770, y), (50, 50, 50), 6)

    return Image.fromarray(cv2.cvtColor(base, cv2.COLOR_BGR2RGB)), (px, py, pw, ph)

def tamper_photo_splice(img, px, py, pw, ph):
    color = tuple(random.randint(80, 200) for _ in range(3))
    patch = Image.new("RGB", (pw - 10, ph - 10), color)
    out = img.copy()
    out.paste(patch, (px + 5, py + 5))
    # Save/reload at lower quality to embed different compression history
    tmp = "tmp_splice.jpg"
    out.save(tmp, "JPEG", quality=random.randint(70, 88))
    out = Image.open(tmp).copy()
    os.remove(tmp)
    return out

def tamper_brightness_patch(img):
    out  = img.copy()
    draw = ImageDraw.Draw(out)
    x1 = random.randint(50, 300)
    y1 = random.randint(50, 200)
    x2 = x1 + random.randint(80, 200)
    y2 = y1 + random.randint(40, 100)
    region = out.crop((x1, y1, x2, y2))
    bright = ImageEnhance.Brightness(region).enhance(random.uniform(1.6, 2.2))
    out.paste(bright, (x1, y1))
    return out

def tamper_text_overlay(img):
    out  = img.copy()
    draw = ImageDraw.Draw(out)
    x = random.randint(60, 350)
    y = random.randint(100, 380)
    # Simulate typed text pasted over existing text
    draw.rectangle([x, y, x + 200, y + 22], fill=(255, 255, 255))
    draw.line([(x + 5, y + 15), (x + 190, y + 15)], fill=(30, 30, 30), width=4)
    return out

def tamper_copy_move(img):
    out = img.copy()
    src_x = random.randint(50, 350)
    src_y = random.randint(80, 300)
    size  = random.randint(60, 130)
    patch = out.crop((src_x, src_y, src_x + size, src_y + size))
    dst_x = src_x + random.randint(100, 200)
    dst_y = src_y + random.randint(-50, 50)
    out.paste(patch, (dst_x % 750, dst_y % 450))
    return out

def tamper_saturation_shift(img):
    out = img.copy()
    x1 = random.randint(80, 300)
    y1 = random.randint(80, 200)
    x2 = x1 + random.randint(100, 250)
    y2 = y1 + random.randint(60, 120)
    region = out.crop((x1, y1, x2, y2)).convert("HSV" if False else "RGB")
    sat_boost = ImageEnhance.Color(region).enhance(random.uniform(2.5, 4.0))
    out.paste(sat_boost, (x1, y1))
    return out

TAMPER_FUNCS = [
    tamper_photo_splice,
    tamper_brightness_patch,
    tamper_text_overlay,
    tamper_copy_move,
    tamper_saturation_shift,
]

def save_authentic(img):
    tmp = "tmp_auth.jpg"
    img.save(tmp, "JPEG", quality=random.randint(90, 98))
    out = Image.open(tmp).copy()
    os.remove(tmp)
    return out

def generate_synthetic_data(num_samples=1000):
    print(f"Generating {num_samples} synthetic ELA samples (realistic tampering)...")
    for d in [TRAIN_DIR, VAL_DIR]:
        for c in CATEGORIES:
            os.makedirs(os.path.join(d, c), exist_ok=True)

    train_n = int(num_samples * 0.8)

    for i in tqdm(range(num_samples)):
        base, (px, py, pw, ph) = make_base_document()
        is_tampered = (i % 2 == 0)

        if is_tampered:
            fn = random.choice(TAMPER_FUNCS)
            # photo-splice needs the box coords
            if fn is tamper_photo_splice:
                final = fn(base, px, py, pw, ph)
            else:
                final = fn(base)
            category = "tampered"
        else:
            final = save_authentic(base)
            category = "authentic"

        ela = get_ela(final).resize((224, 224))
        target_dir = TRAIN_DIR if i < train_n else VAL_DIR
        ela.save(os.path.join(target_dir, category, f"sample_{i}.jpg"))

    print(f"Done — {train_n} train  +  {num_samples - train_n} val  |  2 classes")

if __name__ == "__main__":
    generate_synthetic_data(num_samples=1000)


DATA_DIR = "tamper_dataset"
TRAIN_DIR = os.path.join(DATA_DIR, "train")
VAL_DIR = os.path.join(DATA_DIR, "val")
CATEGORIES = ["authentic", "tampered"]

def get_ela(image, quality=90):
    """Generates ELA image from a PIL Image."""
    temp_filename = "temp_ela_gen.jpg"
    image.save(temp_filename, 'JPEG', quality=quality)
    resaved = Image.open(temp_filename)
    ela_image = ImageChops.difference(image, resaved)
    
    extrema = ela_image.getextrema()
    max_diff = max([ex[1] for ex in extrema])
    if max_diff == 0:
        max_diff = 1
        
    scale = 255.0 / max_diff
    ela_image = ImageEnhance.Brightness(ela_image).enhance(scale)
    os.remove(temp_filename)
    return ela_image

def generate_synthetic_data(num_samples=1000):
    """
    Generates synthetic authentic and tampered ELA images for training.
    Since we don't have MIDV-2020 downloaded, we'll synthesize fake "ID-like" images 
    (text on background) and apply copy-move forgery to them.
    """
    print(f"Generating {num_samples} synthetic ELA samples...")
    for directory in [TRAIN_DIR, VAL_DIR]:
        for cat in CATEGORIES:
            os.makedirs(os.path.join(directory, cat), exist_ok=True)
            
    # Split 80/20 train/val
    train_split = int(num_samples * 0.8)
    
    for i in tqdm(range(num_samples)):
        # 1. Create a fake "authentic" ID document base (gray/white background with noise)
        width, height = 800, 500
        base_img = np.ones((height, width, 3), dtype=np.uint8) * 240
        noise = np.random.randint(0, 15, (height, width, 3), dtype=np.uint8)
        base_img = cv2.add(base_img, noise)
        
        # Add some "text" lines
        for _ in range(5):
            y = random.randint(50, 450)
            cv2.line(base_img, (50, y), (400, y), (50, 50, 50), 4)
            
        # Add a "photo" block
        photo_x, photo_y = 500, 50
        cv2.rectangle(base_img, (photo_x, photo_y), (photo_x+200, photo_y+250), (150, 150, 150), -1)
        
        # Convert to PIL
        authentic_pil = Image.fromarray(cv2.cvtColor(base_img, cv2.COLOR_BGR2RGB))
        
        # Determine if this sample should be tampered
        is_tampered = (i % 2 == 0)
        final_img = authentic_pil.copy()
        
        if is_tampered:
            # 2. Apply a synthetic tamper (copy-move or text splice)
            draw = ImageDraw.Draw(final_img)
            # Simulate pasting a different photo over the original photo
            # We do this by pasting a slightly different colored block
            splice_color = (random.randint(100, 200), random.randint(100, 200), random.randint(100, 200))
            final_img.paste(Image.new('RGB', (180, 230), splice_color), (photo_x+10, photo_y+10))
            
            # Save and reload at different JPEG quality to simulate someone editing and resaving
            temp_tamper = "temp_tamper.jpg"
            final_img.save(temp_tamper, 'JPEG', quality=85) # Spliced region has different compression history
            final_img = Image.open(temp_tamper).copy()
            os.remove(temp_tamper)
            category = "tampered"
        else:
            # Just save normally
            temp_auth = "temp_auth.jpg"
            final_img.save(temp_auth, 'JPEG', quality=95)
            final_img = Image.open(temp_auth).copy()
            os.remove(temp_auth)
            category = "authentic"
            
        # 3. Generate the ELA representation
        ela_result = get_ela(final_img)
        
        # Resize to standard CNN input size (224x224)
        ela_result = ela_result.resize((224, 224))
        
        # Save to appropriate directory
        target_dir = TRAIN_DIR if i < train_split else VAL_DIR
        save_path = os.path.join(target_dir, category, f"sample_{i}.jpg")
        ela_result.save(save_path)

if __name__ == "__main__":
    generate_synthetic_data(num_samples=200) # Reduced to 200 for fast hackathon demo generation
    print("Dataset generated successfully at /tamper_dataset")
