const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot');
const express = require('express');
const QRPortalWeb = require('@bot-whatsapp/portal');
const BaileysProvider = require('@bot-whatsapp/provider/baileys');
const MockAdapter = require('@bot-whatsapp/database/mock');
const axios = require('axios');
const { aesDecrypt } = require('@whiskeysockets/baileys');

const app = express();
const PORT = 3030;
const N8N_WEBHOOK_URL = 'http://149.50.143.17:5678/webhook/whatsappAgent'; //webhook en N8N
const adapterDB = new MockAdapter();
const adapterProvider = createProvider(BaileysProvider);
const adapterFlow = createFlow([]);


const sendDirectMessage = async (provider, jid, message) => {
    try {
        await provider.sendText(jid, message, { options: {} });
        console.log(`Mensaje enviado a ${jid}: ${message}`);
    } catch (error) {
        console.error(`Error al enviar mensaje a ${jid}:`, error);
    }
};

const main = async () => {
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    });

    QRPortalWeb();
    
    adapterProvider.on('message', async (msg) => {
        console.log(`Nuevo mensaje recibido:`, JSON.stringify(msg, null, 2));
    
        const { from, pushName, body } = msg;
        const id = msg.key?.id || "ID_NO_DISPONIBLE";
    
        if (!body) {
            console.log(`Mensaje vacío de ${pushName} (${from}). No procesar.`);
            return;
        }
    
        console.log(`Mensaje de ${pushName || "Desconocido"} (${from}): ${body}`);

        // 📌 Ignoramos mensajes de tipo "EPHEMERAL_SYNC_RESPONSE" (respuestas de sincronización)
        if (message?.protocolMessage?.type === "EPHEMERAL_SYNC_RESPONSE") {
            console.log(`Mensaje de sincronización detectado (ID: ${id}), ignorando...`);
            return;
        }
    
        try {
            const response = await axios.post(N8N_WEBHOOK_URL, {
                numero: from.replace('@s.whatsapp.net', ''),
                mensaje: body,
                nombre: pushName || "Desconocido",
                contexto: id,
            });

            console.log("Respuesta completa de N8N:", response.data); 

            // Verifica si response.data es un array y accede al primer elemento
            if (Array.isArray(response.data) && response.data.length > 0) {
                let keys = Object.keys(response.data[0]); // ["from", "respuesta"]
                let fromKey = keys[0]; // "from"
                let respuestaKey = keys[1]; // "respuesta"
            
                let from = response.data[0][fromKey];
                let respuesta = response.data[0][respuestaKey];
            
                console.log(from); // "573113787978"
                console.log(respuesta); // "¡Hola! ¿En qué puedo ayudarte?"
            
                // Agrega el dominio de WhatsApp si es necesario
                if (!from.includes("@s.whatsapp.net")) {
                    from = from + "@s.whatsapp.net";
                }
                            
                await sendDirectMessage(adapterProvider, from, respuesta);

            } else {
                console.error("La respuesta de N8N no es válida:", response.data);
            }
                        
        } catch (error) {
            console.error("Error enviando a N8N:", error);
        }
    });
        
    //Crea un objeto para enviar un mensaje directo desde un weebhook
    app.get('/send-message', async (req, res) => {
        const { number, message } = req.query;

        if (!number || !message) {
            return res.status(400).send('Faltan parámetros "number" o "message".');
        }

        const jid = `${number}@s.whatsapp.net`; // Formato de WhatsApp

        try {
            await sendDirectMessage(adapterProvider, jid, message);
            res.status(200).send(`Mensaje enviado a ${number}`);
        } catch (error) {
            res.status(500).send(`Error enviando mensaje: ${error.message}`);
        }
    });
};

main();

app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
