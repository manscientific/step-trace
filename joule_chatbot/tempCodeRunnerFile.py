rom flask import Flask, request, jsonify, send_from_directory
import google.generativeai as genai
from flask_cors import CORS
import os

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

# Replace with your real API key
genai.configure(api_key="AIzaSyBSJ9img3nSQd630pr1Nv5QVDFDE4VbRx4")

model = genai.GenerativeModel(
    "gemini-1.5-flash",
    system_instruction=(
       "You are a sustainability assistant who encourages walking, eco-friendly habits, and energy awareness. "
        "You also help users calculate approximate energy, voltage, and power generated using piezoelectric sensors. "
        "If users ask for an approximate value, give an educated estimate using average values. "
        "You may say it's approximate but DO provide answers."
    )
)

chat = model.start_chat(history=[])

@app.route("/")
def serve_home():
    return send_from_directory(".", "index.html")  # serve your HTML file

@app.route("/chat", methods=["POST"])
def chat_with_bot():
    data = request.json
    user_input = data.get("message", "")

    if not user_input:
        return jsonify({"response": "Please enter a message."})

    if user_input.lower().startswith("steps "):
        try:
            steps = int(user_input.split()[1])
            energy_joules = steps * 0.1
            energy_kwh = energy_joules / 3_600_000
            power_watt = energy_joules / steps
            voltage = 0.2
            return jsonify({
                "response": (
                    f"✅ For {steps} steps:\n"
                    f"⚡ Energy: {energy_joules:.2f} J\n"
                    f"🔌 Energy: {energy_kwh:.6f} kWh\n"
                    f"🔋 Power: {power_watt:.2f} W\n"
                    f"🔋 Voltage per step (avg): {voltage:.2f} V\n"
                    f"🌿 That's clean energy from walking!"
                )
            })
        except:
            return jsonify({"response": "Please enter steps like: steps 10000"})

    response = chat.send_message(user_input)
    return jsonify({"response": response.text})

if __name__ == "__main__":
    app.run(debug=True)