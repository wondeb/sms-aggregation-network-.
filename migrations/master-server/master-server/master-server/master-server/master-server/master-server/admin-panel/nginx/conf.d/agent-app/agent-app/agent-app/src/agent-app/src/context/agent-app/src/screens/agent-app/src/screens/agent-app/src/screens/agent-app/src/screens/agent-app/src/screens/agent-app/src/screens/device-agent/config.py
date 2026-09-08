import os
from dotenv import load_dotenv

load_dotenv()

# Master server connection
MASTER_URL = os.getenv("MASTER_URL", "http://YOUR_VPS_IP:3000")
DEVICE_TOKEN = os.getenv("DEVICE_TOKEN", "your_device_token_here")
DEVICE_NAME = os.getenv("DEVICE_NAME", "Android-GSM-Modem-01")

# Timing
HEARTBEAT_INTERVAL = 30      # seconds
SIM_SCAN_INTERVAL = 120      # seconds
RETRY_DELAY = 10             # seconds

# Serial port of the GSM modem (COM3 on Windows, /dev/ttyUSB0 on Linux)
GSM_PORT = os.getenv("GSM_PORT", "/dev/ttyUSB0")
