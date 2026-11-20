# Firmware del ESP32

ESP32 clásico, LCD 1602 I2C, dos botones, potenciómetro y LED indicador. El potenciómetro simula de 0 a 1000 gramos.

## Configurar y cargar

1. Copia `sketch/config.example.h` a `sketch/config.h`.
2. Completa Wi-Fi de **2,4 GHz**, contraseña, URL `https://TU_PROYECTO.vercel.app/api/records` y la misma `DEVICE_TOKEN` del servidor.
3. Abre `sketch/sketch.ino` en Arduino IDE. Conserva los `.h` en la misma carpeta.
4. Instala **LiquidCrystal I2C**. Las otras bibliotecas vienen con el paquete ESP32.
5. Selecciona **ESP32 Dev Module** y el puerto de la placa. Cierra otros programas que usen ese puerto antes de subir.

`config.h` está excluido de Git. Si actualizas solo el `.ino`, conserva tu configuración y `roots.h`.

## Conexiones

| Componente | Pin ESP32 |
|---|---|
| LCD SDA / SCL | GPIO21 / GPIO22 |
| B1: elegir tipo | GPIO32 a GND |
| B2: confirmar | GPIO33 a GND |
| Potenciómetro | Centro GPIO34; extremos 3V3 y GND |
| LED | GPIO25 → resistencia 330 Ω → ánodo; cátodo a GND |

El módulo I2C debe tener niveles compatibles con GPIO de 3,3 V; si eleva SDA/SCL a 5 V requiere adaptación. El LED es un indicador pequeño, no una lámpara UV.

## Operación

- B1 alterna categorías; B2 guarda un peso mayor que cero y solicita su envío.
- Solo la confirmación de resina líquida activa el LED. Se apaga tres segundos después de la última confirmación de esa categoría. Los sólidos no lo activan.
- NVS mantiene hasta 20 registros, sin sobrescribir pendientes. Sobreviven a reinicios y se envían al recuperar Internet.
- Los envíos exitosos son consecutivos y reutilizan HTTPS cuando es posible. Los sockets inactivos se cierran a los 15 segundos.
- Los fallos esperan 1, 2, 4, 8, 16 y hasta 30 segundos. Errores de configuración, conflictos y límites esperan 30 segundos.
- Se desactiva el ahorro Wi-Fi para reducir latencia, con mayor consumo energético.
- NTP sincroniza el reloj para validar HTTPS. Si se registró sin hora fiable, el servidor usa la recepción como fecha alternativa.
- El monitor serie a 115200 muestra tiempos de envío; `L` imprime el historial local.

El espacio NVS sigue siendo `upcy_vercel` al actualizar la versión optimizada. No importa historiales de USB o Sheets.

**Alcance:** peso simulado y LED de demostración. No mide masa real, no controla una lámpara UV ni valida seguridad o eficacia del curado.
