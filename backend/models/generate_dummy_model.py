import torch
import torch.nn as nn

class DummyVoiceModel(nn.Module):
    def __init__(self):
        super().__init__()
        self.fc = nn.Linear(16000, 3)  # assuming 1 sec @16kHz, output 3 classes
    def forward(self, x):
        # x shape: (batch, samples)
        # Pad/truncate to 16000
        if x.shape[1] < 16000:
            pad = 16000 - x.shape[1]
            x = torch.nn.functional.pad(x, (0, pad))
        elif x.shape[1] > 16000:
            x = x[:, :16000]
        return self.fc(x)

model = DummyVoiceModel()
# Initialize weights
for param in model.parameters():
    torch.nn.init.normal_(param, mean=0.0, std=0.1)

torch.save(model.state_dict(), "voice_detection.pt")
print("Dummy model saved to voice_detection.pt")
