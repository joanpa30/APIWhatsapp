const { createBot, createProvider, createFlow, addKeyword } = require('@bot-whatsapp/bot')
const express = require('express')

const QRPortalWeb = require('@bot-whatsapp/portal')
const BaileysProvider = require('@bot-whatsapp/provider/baileys')
const MockAdapter = require('@bot-whatsapp/database/mock')
const app = express() //Llamada a función Express
const PORT = 3030 // Crea el puerto para realizar las peticiones

const flowSecundario = addKeyword(['2', 'siguiente']).addAnswer(['📄 Aquí tenemos el flujo secundario'])

const flowDocs = addKeyword(['doc', 'documentacion', 'documentación']).addAnswer(
    [
        '📄 Aquí encontras las documentación recuerda que puedes mejorarla',
        'https://bot-whatsapp.netlify.app/',
        '\n*2* Para siguiente paso.',
    ],
    null,
    null,
    [flowSecundario]
)

const flowTuto = addKeyword(['tutorial', 'tuto']).addAnswer(
    [
        '🙌 Aquí encontras un ejemplo rapido',
        'https://bot-whatsapp.netlify.app/docs/example/',
        '\n*2* Para siguiente paso.',
    ],
    null,
    null,
    [flowSecundario]
)

const flowGracias = addKeyword(['gracias', 'grac']).addAnswer(
    [
        '🚀 Puedes aportar tu granito de arena a este proyecto',
        '[*opencollective*] https://opencollective.com/bot-whatsapp',
        '[*buymeacoffee*] https://www.buymeacoffee.com/leifermendez',
        '[*patreon*] https://www.patreon.com/leifermendez',
        '\n*2* Para siguiente paso.',
    ],
    null,
    null,
    [flowSecundario]
)

const flowDiscord = addKeyword(['discord']).addAnswer(
    ['🤪 Únete al discord', 'https://link.codigoencasa.com/DISCORD', '\n*2* Para siguiente paso.'],
    null,
    null,
    [flowSecundario]
)

const flowPrincipal = addKeyword(['Bot'])
    .addAnswer('🙌 Hola bienvenido a este *Chatbot*')
    .addAnswer(
        [
            'te comparto los siguientes links de interes sobre el proyecto',
            '👉 *doc* para ver la documentación',
            '👉 *gracias*  para ver la lista de videos',
            '👉 *discord* unirte al discord',
        ],
        null,
        null,
        [flowDocs, flowGracias, flowTuto, flowDiscord]
    )

    //Envia mensaje directo desde whatsapp a un numero de movil
    const sendDirectMessage = async (provider, jid, message) => {
        try {
            await provider.sendText(jid, message, {options: {}});
            console.log(`Message sent to ${jid}`);
        } catch (error) {
            console.error(`Failed to send message to ${jid}:`, error);
        }
    };


    const main = async () => {
    const adapterDB = new MockAdapter()
    const adapterFlow = createFlow([flowPrincipal])
    const adapterProvider = createProvider(BaileysProvider)

    
    createBot({
        flow: adapterFlow,
        provider: adapterProvider,
        database: adapterDB,
    })

    QRPortalWeb()

// Metodo para obtener el mensaje desde un Http
    app.get('/send-message', async (req, res) => {
        const {number, message} = req.query;

        if (!number || !message) {
            return res.status(400).send('Missing "number" or "message" query parameters.');
        }

        const jid = `${number}@s.whatsapp.net`; // Format the number into WhatsApp JID

        try {
            await sendDirectMessage(adapterProvider, jid, message);
            res.status(200).send(`Message sent to ${number}`);
        } catch (error) {
            res.status(500).send(`Failed to send message: ${error.message}`);
        }
    });

    adapterProvider.on('ready', () => {
        console.log('Provider is ready.');
    });

    adapterProvider.on('error', (err) => {
        console.error('Provider error:', err);
    });

    app.listen(PORT, () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        });

}

main()
