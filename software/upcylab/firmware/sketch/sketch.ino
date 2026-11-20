/* UPCYLAB - ESP32, LCD 1602 I2C, dos botones y potenciometro.
   Peso SIMULADO: 0..1000 gramos. No controla una lampara UV.
   B1 cambia tipo; B2 guarda. Serial 115200: L exporta ultimos 20.
   WiFi sincroniza UTC y envia a Vercel; pendientes en NVS (maximo 20). */
#include <Arduino.h>
#include <Wire.h>
#include <WiFi.h>
#include <Preferences.h>
#include <LiquidCrystal_I2C.h>
#include <time.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <esp_system.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#include "config.h"
#include "roots.h"

constexpr uint8_t PIN_TIPO=32, PIN_OK=33, PIN_PESO=34;
constexpr uint8_t PIN_LED=25; // LED indicador con resistencia de 330 ohmios.
constexpr uint32_t LED_MS=3000; // Solo demostracion, NO tiempo de curado.
constexpr uint16_t MAX_GRAMOS=1000;
constexpr uint8_t CAPACIDAD=20;
constexpr uint32_t VERSION=0x55564331;

struct Boton {
  uint8_t pin;
  bool anterior=HIGH, estable=HIGH;
  uint32_t cambio=0;
  explicit Boton(uint8_t p):pin(p) {}
  void begin() { pinMode(pin, INPUT_PULLUP); }
  bool pulsado(uint32_t ahora) {
    bool lectura=digitalRead(pin);
    if(lectura!=anterior) { anterior=lectura; cambio=ahora; }
    if(ahora-cambio>=35 && lectura!=estable) {
      estable=lectura;
      return estable==LOW;
    }
    return false;
  }
};
struct Registro {
  int64_t fechaUtc;
  uint32_t id;
  uint16_t gramos;
  uint8_t tipo;
  bool enviado;
  char uid[65];
};
struct Historial {
  uint32_t version=VERSION, secuencia=0;
  uint8_t cantidad=0, siguiente=0;
  Registro registros[CAPACIDAD]={};
};
LiquidCrystal_I2C lcd(0x27,16,2);
Preferences memoria;
Boton botonTipo(PIN_TIPO), botonOK(PIN_OK);
Historial historial;
uint8_t tipo=0;
uint16_t gramos=0;
bool memoriaOK=false, ledActivo=false;
uint32_t ledDesde=0;
struct Resultado { char uid[65]; bool ok; int codigo; uint32_t duracionMs; };
QueueHandle_t solicitudes=nullptr, resultados=nullptr;
bool enviando=false;
uint32_t reintentoDesde=0, esperaReintento=0;
uint8_t fallosConsecutivos=0;
int ultimoError=0;
bool wifiAnterior=false;
uint32_t ultimaPantalla=0, ultimaMuestra=0, avisoDesde=0;
const char *aviso=nullptr;
const char *nombreTipo(uint8_t valor) {
  return valor==0 ? "RESINA_LIQUIDA" : "SOLIDOS_EPIS";
}
bool horaValida() { return time(nullptr)>=1704067200; }
void mostrarAviso(const char *texto) { aviso=texto; avisoDesde=millis(); }
void linea(uint8_t fila, const char *texto) {
  char salida[17];
  snprintf(salida,sizeof(salida),"%-16.16s",texto);
  lcd.setCursor(0,fila); lcd.print(salida);
}
void imprimirRegistro(const Registro &r) {
  time_t instante=(time_t)r.fechaUtc;
  struct tm fecha;
  gmtime_r(&instante,&fecha);
  char texto[24];
  if(r.fechaUtc>=1704067200) strftime(texto,sizeof(texto),"%Y-%m-%dT%H:%M:%SZ",&fecha);
  else snprintf(texto,sizeof(texto),"SIN_HORA_ESP32");
  Serial.printf("%lu,%s,%s,%u,%.3f\n",(unsigned long)r.id,texto,
                nombreTipo(r.tipo),(unsigned)r.gramos,r.gramos/1000.0);
}
void exportar() {
  Serial.println("id,fecha_hora_UTC,tipo,gramos,kilogramos");
  uint8_t primero=(historial.siguiente+CAPACIDAD-historial.cantidad)%CAPACIDAD;
  for(uint8_t i=0;i<historial.cantidad;i++)
    imprimirRegistro(historial.registros[(primero+i)%CAPACIDAD]);
}

bool enviarNube(const Registro &r,WiFiClientSecure &cliente,HTTPClient &http,int &codigo) {
  codigo=-1;
  if(WiFi.status()!=WL_CONNECTED) return false;
  if(!http.begin(cliente,API_URL)) return false;
  http.addHeader("Content-Type","application/json");
  http.addHeader("Authorization",String("Bearer ")+DEVICE_TOKEN);
  String fecha="null";
  if(r.fechaUtc>=1704067200) {
    time_t instante=(time_t)r.fechaUtc;
    struct tm utc; gmtime_r(&instante,&utc);
    char texto[24]; strftime(texto,sizeof(texto),"%Y-%m-%dT%H:%M:%SZ",&utc);
    fecha=String("\"")+texto+"\"";
  }
  String cuerpo=String("{\"uid\":\"")+r.uid+"\",\"type\":\""+nombreTipo(r.tipo)
    +"\",\"grams\":"+String(r.gramos)+",\"measured_at\":"+fecha+"}";
  codigo=http.POST(cuerpo);
  String respuesta=codigo==200?http.getString():String("");
  respuesta.trim();
  // La API responde con el ID exacto SOLO despues de guardar en PostgreSQL.
  bool confirmado=codigo==200 && respuesta==String("{\"ok\":true,\"uid\":\"")+r.uid+"\"}";
  // Un error o respuesta incompleta obliga a abrir una conexion limpia al reintentar.
  if(!confirmado) cliente.stop();
  http.end();
  return confirmado;
}
void tareaNube(void *) {
  // Solo esta tarea usa el cliente. Mantiene TLS/HTTP para los siguientes pendientes.
  WiFiClientSecure cliente;
  cliente.setCACert(VERCEL_CA);
  cliente.setHandshakeTimeout(10);
  HTTPClient http;
  http.setReuse(true);
  http.setConnectTimeout(6000); http.setTimeout(10000);
  http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
  uint32_t ultimoUso=0;
  Registro r;
  for(;;) {
    if(xQueueReceive(solicitudes,&r,pdMS_TO_TICKS(1000))==pdTRUE) {
      // No reutilizar un socket que el servidor pudo cerrar por inactividad.
      if(millis()-ultimoUso>=15000) cliente.stop();
      Resultado resultado={};
      snprintf(resultado.uid,sizeof(resultado.uid),"%s",r.uid);
      uint32_t inicio=millis();
      resultado.ok=enviarNube(r,cliente,http,resultado.codigo);
      resultado.duracionMs=millis()-inicio;
      ultimoUso=millis();
      xQueueSend(resultados,&resultado,portMAX_DELAY);
    } else if(millis()-ultimoUso>=15000 || WiFi.status()!=WL_CONNECTED) {
      cliente.stop();
      http.end();
    }
  }
}
void programarReintento(int codigo) {
  ultimoError=codigo;
  if(fallosConsecutivos<6) fallosConsecutivos++;
  esperaReintento=1000UL<<(fallosConsecutivos-1);
  if(esperaReintento>30000) esperaReintento=30000;
  // Configuracion, conflicto o limite: no insistir cada segundo contra la API.
  if(codigo==400 || codigo==401 || codigo==403 || codigo==409 || codigo==422 || codigo==429)
    esperaReintento=30000;
  reintentoDesde=millis();
}
void procesarNube(uint32_t ahora) {
  if(!solicitudes || !resultados) return;
  bool wifiDisponible=WiFi.status()==WL_CONNECTED;
  if(wifiDisponible && !wifiAnterior && ultimoError<=0) esperaReintento=0;
  wifiAnterior=wifiDisponible;
  Resultado respuesta;
  if(xQueueReceive(resultados,&respuesta,0)==pdTRUE) {
    enviando=false;
    if(respuesta.ok) {
      Historial actualizado=historial;
      uint8_t tipoConfirmado=255;
      for(uint8_t i=0;i<CAPACIDAD;i++)
        if(strcmp(actualizado.registros[i].uid,respuesta.uid)==0) {
          actualizado.registros[i].enviado=true;
          tipoConfirmado=actualizado.registros[i].tipo;
        }
      if(memoria.putBytes("historial",&actualizado,sizeof(actualizado))==sizeof(actualizado)) {
        historial=actualizado; mostrarAviso("Guardado nube OK");
        // En caso de exito, el siguiente pendiente sale inmediatamente.
        fallosConsecutivos=0; esperaReintento=0; ultimoError=0;
        if(tipoConfirmado==0) {
          digitalWrite(PIN_LED,HIGH); ledDesde=millis(); ledActivo=true;
        }
        Serial.printf("Vercel: confirmado en %lu ms.\n",(unsigned long)respuesta.duracionMs);
      } else {
        mostrarAviso("Error memoria");
        programarReintento(0); // No marcar enviado hasta persistir el ACK.
      }
    } else {
      mostrarAviso(respuesta.codigo==401?"Revisar token":respuesta.codigo==409?"Conflicto de ID":"Nube: pendiente");
      programarReintento(respuesta.codigo);
      Serial.printf("Vercel: HTTP %d; reintento en %lu ms.\n",respuesta.codigo,(unsigned long)esperaReintento);
    }
  }
  if(enviando || !memoriaOK || !wifiDisponible ||
     !horaValida() || millis()-reintentoDesde<esperaReintento ||
     !String(API_URL).startsWith("https://") ||
     !String(API_URL).endsWith("/api/records") || strlen(DEVICE_TOKEN)<32 ||
     String(DEVICE_TOKEN).startsWith("CAMBIA_")) return;
  uint8_t primero=(historial.siguiente+CAPACIDAD-historial.cantidad)%CAPACIDAD;
  for(uint8_t i=0;i<historial.cantidad;i++) {
    Registro &r=historial.registros[(primero+i)%CAPACIDAD];
    if(!r.enviado) {
      enviando=xQueueSend(solicitudes,&r,0)==pdTRUE;
      break;
    }
  }
}

void guardar() {
  if(gramos==0) { mostrarAviso("Seleccione >0 g"); return; }
  if(!memoriaOK) { mostrarAviso("Error memoria"); return; }
  if(historial.cantidad==CAPACIDAD && !historial.registros[historial.siguiente].enviado) {
    mostrarAviso("Cola llena: 20"); return; // Nunca sobrescribe pendientes.
  }
  Historial nuevo=historial;
  Registro r={};
  r.fechaUtc=horaValida()?(int64_t)time(nullptr):0;
  r.id=++nuevo.secuencia; r.gramos=gramos; r.tipo=tipo;
  String mac=WiFi.macAddress(); mac.replace(":","");
  snprintf(r.uid,sizeof(r.uid),"%s-%lu-%lld-%08lx",mac.c_str(),
           (unsigned long)r.id,(long long)r.fechaUtc,(unsigned long)esp_random());
  nuevo.registros[nuevo.siguiente]=r;
  nuevo.siguiente=(nuevo.siguiente+1)%CAPACIDAD;
  if(nuevo.cantidad<CAPACIDAD) nuevo.cantidad++;
  if(memoria.putBytes("historial",&nuevo,sizeof(nuevo))!=sizeof(nuevo)) {
    mostrarAviso("Error al guardar"); return;
  }
  historial=nuevo;
  imprimirRegistro(r);
  // Un registro nuevo no anula la espera si la red o la API estan fallando.
  if(fallosConsecutivos==0) esperaReintento=0;
  mostrarAviso("Guardado local");
}
void setup() {
  digitalWrite(PIN_LED,LOW);
  pinMode(PIN_LED,OUTPUT);
  Serial.begin(115200);
  botonTipo.begin(); botonOK.begin();
  analogReadResolution(12);
  Wire.begin(21,22);
  lcd.init(); lcd.backlight();
  linea(0,"UPCYLAB"); linea(1,"Iniciando...");
  memoriaOK=memoria.begin("upcy_vercel",false);
  if(memoriaOK && memoria.getBytesLength("historial")==sizeof(Historial)) {
    Historial leido;
    if(memoria.getBytes("historial",&leido,sizeof(leido))==sizeof(leido)
       && leido.version==VERSION && leido.cantidad<=CAPACIDAD
       && leido.siguiente<CAPACIDAD) historial=leido;
  }
  solicitudes=xQueueCreate(1,sizeof(Registro));
  resultados=xQueueCreate(1,sizeof(Resultado));
  if(solicitudes && resultados) {
    if(xTaskCreate(tareaNube,"vercel",16384,nullptr,1,nullptr)!=pdPASS) {
      vQueueDelete(solicitudes); vQueueDelete(resultados);
      solicitudes=nullptr; resultados=nullptr;
    }
  } else {
    if(solicitudes) vQueueDelete(solicitudes);
    if(resultados) vQueueDelete(resultados);
    solicitudes=nullptr; resultados=nullptr;
  }
  if(!solicitudes) Serial.println("Error: tarea nube no disponible. Reinicie.");
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false); // Menor latencia; consume mas energia que el ahorro Wi-Fi.
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID,WIFI_CLAVE);
  configTime(0,0,"pool.ntp.org","time.nist.gov");
  Serial.println("UPCYLAB: peso simulado. B1=tipo, B2=guardar; L=CSV UTC.");
}
void loop() {
  procesarNube(millis());
  uint32_t ahora=millis();
  if(ledActivo && ahora-ledDesde>=LED_MS) {
    digitalWrite(PIN_LED,LOW); ledActivo=false;
  }
  if(ahora-ultimaMuestra>=40) {
    ultimaMuestra=ahora;
    uint32_t suma=0;
    for(uint8_t i=0;i<8;i++) suma+=analogRead(PIN_PESO);
    gramos=(suma*(uint32_t)MAX_GRAMOS+16380UL)/32760UL;
  }
  if(botonTipo.pulsado(ahora)) tipo=1-tipo;
  bool confirmar=botonOK.pulsado(ahora);
  // Una pulsacion larga genera un solo registro. Bloquea doble clic accidental.
  if(confirmar && !ledActivo && (!aviso || ahora-avisoDesde>=1200)) guardar();
  while(Serial.available()) {
    char c=Serial.read();
    if(c=='L' || c=='l') exportar();
  }
  if(aviso && millis()-avisoDesde>=1600) aviso=nullptr;
  if(ahora-ultimaPantalla>=150) {
    ultimaPantalla=ahora;
    char peso[17];
    snprintf(peso,sizeof(peso),"%-7s %4u g",tipo==0?"Resina":"Solidos",(unsigned)gramos);
    linea(0,peso);
    if(aviso) linea(1,aviso);
    else if(ledActivo) linea(1,"LED prueba activo");
    else if(!memoriaOK) linea(1,"Error memoria");
    else if(!horaValida()) linea(1,WiFi.status()==WL_CONNECTED?"Esperando NTP":"Conectando WiFi");
    else if(!solicitudes) linea(1,"Error tarea nube");
    else if(String(API_URL).indexOf("TU_PROYECTO")>=0 || String(DEVICE_TOKEN).startsWith("CAMBIA_"))
      linea(1,"Configurar nube");
    else if(enviando) linea(1,"Enviando nube...");
    else linea(1,"B1:Tipo B2:OK");
  }
  delay(1);
}
