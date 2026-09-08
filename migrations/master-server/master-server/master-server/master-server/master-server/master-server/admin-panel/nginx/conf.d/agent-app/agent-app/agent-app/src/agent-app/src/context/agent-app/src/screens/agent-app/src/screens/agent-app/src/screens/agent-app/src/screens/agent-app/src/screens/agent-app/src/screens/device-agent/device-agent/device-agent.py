"""
SMS Device Agent
Runs on the physical machine holding the GSM modem / SIM pool.
Registers the device, scans SIM ports, and streams status to the master server.
"""
import time
import json
import threading
import requests
import websocket
from config import (
    MASTER_URL, DEVICE_TOKEN, DEVICE_NAME,
    HEARTBEAT_INTERVAL, SIM_SCAN_INTERVAL, GSM_PORT
)

HEADERS = {"Authorization": f"Bearer {DEVICE_TOKEN}"}


class DeviceAgent:
    def __init__(self):
        self.device_id = None
        self.sims = []
        self.ws = None
        self.running = True

    # ---------- Registration ----------
    def register_device(self):
        """Register this physical device with the master server."""
        try:
            resp = requests.post(
                f"{MASTER_URL}/api/devices",
                json={"deviceName": DEVICE_NAME, "totalPorts": 8},
                headers=HEADERS,
                timeout=10
            )
            resp.raise_for_status()
            self.device_id = resp.json()["deviceId"]
            print(f"[OK] Device registered: {self.device_id}")
            return True
        except Exception as e:
            print(f"[ERR] Registration failed: {e}")
            return False

    # ---------- SIM scanning ----------
    def scan_sims(self):
        """
        Query the GSM modem for each port's status.
        Replace this stub with your real AT-command logic (e.g. pyserial).
        """
        ports = [f"COM{i}" for i in range(1, 9)]
        results = []
        for port in ports:
            # Placeholder: real implementation sends AT commands per port
            results.append({
                "port": port,
                "model": "SIM7600",
                "operator": "Airtel",
                "signal_db": -71,
                "status": "ready"
            })
        return results

    def report_sims(self):
        """Push SIM status updates to the master server."""
        for sim in self.sims:
            try:
                requests.post(
                    f"{MASTER_URL}/api/sims/register",
                    json={
                        "deviceId": self.device_id,
                        **sim
                    },
                    headers=HEADERS,
                    timeout=10
                )
            except Exception as e:
                print(f"[ERR] SIM report failed on {sim['port']}: {e}")

    # ---------- Websocket ----------
    def connect_ws(self):
        """Open a websocket to stream live status."""
        ws_url = MASTER_URL.replace("http", "ws") + "/socket.io/?EIO=4&transport=websocket"

        def on_open(ws):
            print("[OK] Websocket connected")
            ws.send(json.dumps({"token": DEVICE_TOKEN}))

        def on_message(ws, msg):
            try:
                data = json.loads(msg)
                if data.get("type") == "run_order":
                    self.handle_order(data)
            except Exception as e:
                print(f"[ERR] WS message error: {e}")

        def on_error(ws, error):
            print(f"[ERR] Websocket error: {error}")

        def on_close(ws, code, msg):
            print("[WARN] Websocket closed, reconnecting...")

        self.ws = websocket.WebSocketApp(
            ws_url,
            on_open=on_open,
            on_message=on_message,
            on_error=on_error,
            on_close=on_close
        )

        threading.Thread(target=self.ws.run_forever, daemon=True).start()

    def handle_order(self, data):
        """
        Receive an activation order, read the SMS from the right SIM,
        and send the code back to the server.
        """
        port = data.get("port")
        print(f"[ORDER] Reading code on port {port}")

        # Placeholder: real implementation reads SMS via AT+CMGR
        code = "123456"

        try:
            requests.post(
                f"{MASTER_URL}/api/orders/activate",
                json={"orderId": data["orderId"], "activationCode": code},
                headers=HEADERS,
                timeout=10
            )
            print(f"[OK] Code {code} submitted for order {data['orderId']}")
        except Exception as e:
            print(f"[ERR] Activation submit failed: {e}")

    # ---------- Loops ----------
    def heartbeat_loop(self):
        while self.running:
            try:
                requests.post(
                    f"{MASTER_URL}/api/devices/heartbeat",
                    json={
                        "deviceId": self.device_id,
                        "activePorts": len([s for s in self.sims if s["status"] == "ready"])
                    },
                    headers=HEADERS,
                    timeout=10
                )
            except Exception as e:
                print(f"[ERR] Heartbeat failed: {e}")
            time.sleep(HEARTBEAT_INTERVAL)

    def scan_loop(self):
        while self.running:
            self.sims = self.scan_sims()
            self.report_sims()
            time.sleep(SIM_SCAN_INTERVAL)

    # ---------- Entry ----------
    def run(self):
        while not self.register_device():
            time.sleep(5)

        self.connect_ws()
        threading.Thread(target=self.heartbeat_loop, daemon=True).start()
        threading.Thread(target=self.scan_loop, daemon=True).start()

        try:
            while self.running:
                time.sleep(1)
        except KeyboardInterrupt:
            print("\n[STOP] Shutting down device agent")
            self.running = False
            if self.ws:
                self.ws.close()


if __name__ == "__main__":
    DeviceAgent().run()
