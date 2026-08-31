import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import datasets, models, transforms
from torch.utils.data import DataLoader
import os, time, copy

def train_model():
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}  |  VRAM: {torch.cuda.get_device_properties(0).total_memory // 1024**2} MB")
    else:
        print("WARNING: No CUDA — training on CPU (slow)")

    data_dir = "tamper_dataset"
    if not os.path.exists(data_dir):
        print("Run generate_tamper_dataset.py first.")
        return

    # Augmentation for training; plain normalise for val
    data_transforms = {
        "train": transforms.Compose([
            transforms.RandomHorizontalFlip(),
            transforms.RandomVerticalFlip(),
            transforms.RandomRotation(15),
            transforms.ColorJitter(brightness=0.3, contrast=0.3),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]),
        "val": transforms.Compose([
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ]),
    }

    image_datasets = {
        x: datasets.ImageFolder(os.path.join(data_dir, x), data_transforms[x])
        for x in ["train", "val"]
    }
    # num_workers=0 on Windows avoids multiprocessing spawn issues
    dataloaders = {
        x: DataLoader(image_datasets[x], batch_size=32, shuffle=True, num_workers=0, pin_memory=(device.type == "cuda"))
        for x in ["train", "val"]
    }
    dataset_sizes = {x: len(image_datasets[x]) for x in ["train", "val"]}
    class_names   = image_datasets["train"].classes
    print(f"Classes: {class_names}")
    print(f"Train: {dataset_sizes['train']}  |  Val: {dataset_sizes['val']}")

    # MobileNetV2 pretrained — unfreeze last 3 feature blocks + classifier
    model = models.mobilenet_v2(weights=models.MobileNet_V2_Weights.DEFAULT)
    for param in model.parameters():
        param.requires_grad = False
    # Unfreeze last 3 InvertedResidual blocks for fine-tuning
    for layer in list(model.features.children())[-3:]:
        for param in layer.parameters():
            param.requires_grad = True
    # Replace final classifier head for binary classification
    num_ftrs = model.classifier[1].in_features
    model.classifier[1] = nn.Linear(num_ftrs, len(class_names))
    model = model.to(device)

    criterion = nn.CrossEntropyLoss()
    optimizer = optim.Adam(
        filter(lambda p: p.requires_grad, model.parameters()),
        lr=1e-3,
    )
    # Drop LR smoothly over epochs
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=10)

    num_epochs     = 10
    best_acc       = 0.0
    best_model_wts = copy.deepcopy(model.state_dict())

    since = time.time()
    for epoch in range(num_epochs):
        print(f"\nEpoch {epoch + 1}/{num_epochs}  LR={scheduler.get_last_lr()[0]:.5f}")
        for phase in ["train", "val"]:
            model.train() if phase == "train" else model.eval()
            running_loss = running_correct = 0

            for inputs, labels in dataloaders[phase]:
                inputs, labels = inputs.to(device), labels.to(device)
                optimizer.zero_grad()
                with torch.set_grad_enabled(phase == "train"):
                    outputs = model(inputs)
                    _, preds = torch.max(outputs, 1)
                    loss = criterion(outputs, labels)
                    if phase == "train":
                        loss.backward()
                        optimizer.step()
                running_loss    += loss.item() * inputs.size(0)
                running_correct += torch.sum(preds == labels).item()

            epoch_loss = running_loss / dataset_sizes[phase]
            epoch_acc  = running_correct / dataset_sizes[phase]
            print(f"  {phase:5s}  loss={epoch_loss:.4f}  acc={epoch_acc:.4f}", end="")
            if device.type == "cuda":
                print(f"  VRAM used={torch.cuda.memory_allocated() // 1024**2} MB", end="")
            print()

            if phase == "val" and epoch_acc > best_acc:
                best_acc       = epoch_acc
                best_model_wts = copy.deepcopy(model.state_dict())
                print(f"  *** New best val acc: {best_acc:.4f} — saved ***")

        scheduler.step()

    elapsed = time.time() - since
    print(f"\nTraining complete in {elapsed // 60:.0f}m {elapsed % 60:.0f}s")
    print(f"Best val accuracy: {best_acc:.4f}")

    model.load_state_dict(best_model_wts)
    torch.save(model.state_dict(), "tamper_model.pth")
    print("Saved: tamper_model.pth")

if __name__ == "__main__":
    import multiprocessing
    multiprocessing.freeze_support()
    train_model()
