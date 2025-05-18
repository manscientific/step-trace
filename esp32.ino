#include <WiFi.h>
#include <WebServer.h>
#include <ESPmDNS.h>

const char* ssid = "rudra";
const char* password = "11111111";

const int piezoPin = 34;
WebServer server(80);

// ─── Measurement Parameters ───
float voltage = 0.0;
const float NOISE_THRESHOLD = 0.01;
unsigned long lastUpdate = 0;
const long updateInterval = 100;
float baseline = 0.0;

// Grouping parameters
const int GROUP_SIZE = 5;          // Number of readings to group
float groupBuffer[GROUP_SIZE];     // Buffer for grouped readings
int bufferIndex = 0;               // Current position in buffer
float groupSum = 0;                // Running sum of current group
int validReadingsInGroup = 0;      // Count of non-zero readings

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  // Initialize WiFi
  WiFi.begin(ssid, password);
  Serial.print("Connecting to hotspot ");
  Serial.print(ssid);
  Serial.println(" …");

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 15000) {
    delay(500);
    Serial.print(".");
  }
  
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("❌ Failed to connect to hotspot");
  } else {
    Serial.println("✅ Connected!");
    Serial.print("IP Address: http://");
    Serial.println(WiFi.localIP());
  }

  // mDNS setup
  if (MDNS.begin("esp32")) {
    Serial.println("mDNS responder started: http://esp32.local");
  }

  // Web server setup
  server.enableCORS(true);
  server.on("/data", handleData);
  server.on("/", []() {
    server.send(200, "text/plain", 
      "ESP32 Piezo Sensor API\n"
      "• GET /data → {\"voltage\":<volts>}\n"
      "• Output: Average of every " + String(GROUP_SIZE) + " readings\n"
    );
  });

  server.begin();
  Serial.println("HTTP server started");

  // Configure ADC
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  
  // Initialize grouping buffer
  for (int i = 0; i < GROUP_SIZE; i++) {
    groupBuffer[i] = 0;
  }
  
  calculateBaseline();
}

void loop() {
  server.handleClient();

  if (millis() - lastUpdate >= updateInterval) {
    lastUpdate = millis();
    
    // Take reading
    float rawVoltage = analogRead(piezoPin) * (3.3 / 4095.0);
    
    // Dynamic baseline adjustment
    baseline = baseline * 0.995 + rawVoltage * 0.005;
    
    // Process reading
    float processedVoltage = 0;
    if (rawVoltage > (baseline + NOISE_THRESHOLD)) {
      processedVoltage = rawVoltage - baseline;
      validReadingsInGroup++;
    }
    
    // Add to group buffer
    groupSum += processedVoltage;
    bufferIndex++;
    
    // When group is complete
    if (bufferIndex >= GROUP_SIZE) {
      // Calculate average of non-zero readings
      if (validReadingsInGroup > 0) {
        voltage = groupSum / validReadingsInGroup;
        Serial.println("Group Average: " + String(voltage, 3) + " V (" + String(validReadingsInGroup) + " valid readings)");
      } else {
        voltage = 0.0;
      }
      
      // Reset group counters
      groupSum = 0;
      bufferIndex = 0;
      validReadingsInGroup = 0;
    }
  }
}

void calculateBaseline() {
  Serial.println("Calculating baseline...");
  float sum = 0;
  for (int i = 0; i < 100; i++) {
    sum += analogRead(piezoPin) * (3.3 / 4095.0);
    delay(10);
  }
  baseline = sum / 100;
  Serial.println("Baseline noise level: " + String(baseline, 3) + "V");
}

void handleData() {
  String payload = "{\"voltage\":" + String(voltage, 3) + "}";
  server.send(200, "application/json", payload);
}