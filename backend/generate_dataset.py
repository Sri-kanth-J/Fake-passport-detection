import os
import urllib.request
from PIL import Image, ImageDraw


def download_image(url, filename):
    """Download an image with a browser-like User-Agent."""
    try:
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/131.0 Safari/537.36"
                )
            }
        )

        with urllib.request.urlopen(request, timeout=30) as response:
            with open(filename, "wb") as output:
                output.write(response.read())

        print(f"Downloaded: {filename}")
        return True

    except Exception as e:
        print(f"Failed to download {filename}: {e}")
        return False


def setup_mock_data():
    base_dir = os.path.dirname(os.path.abspath(__file__))

    db_path = os.path.join(base_dir, "mock_face_db")
    sample_dir = os.path.join(base_dir, "sample_documents")

    # Create directories
    os.makedirs(db_path, exist_ok=True)
    os.makedirs(sample_dir, exist_ok=True)

    # ---------------------------------------------------------
    # 1. Face database image
    # ---------------------------------------------------------
    sample_face_url = (
        "https://upload.wikimedia.org/wikipedia/commons/8/85/"
        "Elon_Musk_Royal_Society_%28crop1%29.jpg"
    )

    face_path = os.path.join(db_path, "person1.jpg")

    download_image(sample_face_url, face_path)

    # ---------------------------------------------------------
    # 2. Passport sample
    # ---------------------------------------------------------
    sample_passport_url = (
        "https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/"
        "Biometric_Passport_of_the_Republic_of_India.jpg/"
        "800px-Biometric_Passport_of_the_Republic_of_India.jpg"
    )

    passport_path = os.path.join(
        sample_dir,
        "sample_passport.jpg"
    )

    passport_downloaded = download_image(
        sample_passport_url,
        passport_path
    )

    # ---------------------------------------------------------
    # 3. Create tampered passport
    # ---------------------------------------------------------
    if passport_downloaded and os.path.exists(passport_path):
        try:
            img = Image.open(passport_path).convert("RGB")

            draw = ImageDraw.Draw(img)

            # Add a black rectangle to simulate tampering
            draw.rectangle(
                [100, 100, 300, 150],
                fill="black"
            )

            tampered_path = os.path.join(
                sample_dir,
                "tampered_passport.jpg"
            )

            img.save(tampered_path)

            print(f"Created: {tampered_path}")

        except Exception as e:
            print(f"Could not create tampered sample: {e}")

    else:
        print(
            "Skipping tampered passport creation because "
            "sample_passport.jpg was not downloaded."
        )


if __name__ == "__main__":
    print("Setting up mock datasets and databases...")

    setup_mock_data()

    print("Done!")
