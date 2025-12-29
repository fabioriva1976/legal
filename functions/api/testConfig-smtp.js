// functions/api/testSmtp.js

const { onCall } = require("firebase-functions/v2/https");
const { getFirestore } = require("firebase-admin/firestore");
const nodemailer = require("nodemailer");
const { region } = require("../index.js");

exports.testSmtpApi = onCall({ region }, async (request) => {
    console.log("🔍 testSmtpApi chiamata con request.data:", request.data);

    if (!request.auth) {
        throw new Error("Devi essere autenticato.");
    }

    const { testEmail } = request.data;
    console.log("📧 Email di test:", testEmail);

    try {
        const db = getFirestore();

        // Carica la configurazione SMTP da Firestore
        console.log("📋 Caricamento configurazione SMTP da Firestore...");
        const smtpConfigDoc = await db.collection("configurazioni").doc("smtp").get();

        if (!smtpConfigDoc.exists) {
            console.error("❌ Documento configurazione SMTP non trovato");
            throw new Error("❌ Configurazione SMTP non trovata in Firestore. Configura SMTP prima di testare la connessione.");
        }

        const smtpConfig = smtpConfigDoc.data();
        console.log("✅ Configurazione SMTP caricata:", {
            host: smtpConfig.host,
            port: smtpConfig.port,
            user: smtpConfig.user,
            secure: smtpConfig.secure,
            hasPassword: !!smtpConfig.password
        });

        // Verifica che tutti i parametri necessari siano presenti
        if (!smtpConfig.host || !smtpConfig.port || !smtpConfig.user || !smtpConfig.password) {
            console.error("❌ Configurazione incompleta:", {
                hasHost: !!smtpConfig.host,
                hasPort: !!smtpConfig.port,
                hasUser: !!smtpConfig.user,
                hasPassword: !!smtpConfig.password
            });
            throw new Error("❌ Configurazione SMTP incompleta. Verifica host, port, user e password in Firestore.");
        }

        console.log(`📧 Testing SMTP configuration: ${smtpConfig.host}:${smtpConfig.port}`);

        // Crea il transporter con la configurazione da Firestore
        const transporter = nodemailer.createTransport({
            host: smtpConfig.host,
            port: smtpConfig.port,
            secure: smtpConfig.secure || false,
            auth: {
                user: smtpConfig.user,
                pass: smtpConfig.password,
            },
        });

        // STEP 1: Verifica la connessione SMTP
        console.log("🔍 Verifica connessione SMTP...");
        await transporter.verify();
        console.log("✅ Connessione SMTP verificata con successo!");

        // STEP 2: Invia email di test (se specificato un indirizzo)
        if (testEmail) {
            console.log(`📨 Invio email di test a: ${testEmail}`);

            const fromAddress = smtpConfig.fromName
                ? `"${smtpConfig.fromName}" <${smtpConfig.from}>`
                : smtpConfig.from;

            const mailOptions = {
                from: fromAddress,
                to: testEmail,
                subject: "✅ Test Configurazione SMTP",
                html: `
                    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                        <h2 style="color: #059669;">✅ Configurazione SMTP Funzionante</h2>
                        <p>Questa è un'email di test per verificare che la configurazione SMTP sia corretta.</p>

                        <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                            <h3 style="margin-top: 0;">Dettagli Configurazione:</h3>
                            <ul style="list-style: none; padding: 0;">
                                <li><strong>Server SMTP:</strong> ${smtpConfig.host}</li>
                                <li><strong>Porta:</strong> ${smtpConfig.port}</li>
                                <li><strong>Connessione Sicura:</strong> ${smtpConfig.secure ? 'Sì (TLS/SSL)' : 'No'}</li>
                                <li><strong>Da:</strong> ${fromAddress}</li>
                            </ul>
                        </div>

                        <p style="color: #6b7280; font-size: 14px;">
                            Se hai ricevuto questa email, significa che il tuo server SMTP è configurato correttamente
                            e può inviare email.
                        </p>

                        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;">

                        <p style="color: #9ca3af; font-size: 12px;">
                            Questa email è stata generata automaticamente dal sistema di test SMTP.
                            <br>Data: ${new Date().toLocaleString('it-IT')}
                        </p>
                    </div>
                `,
            };

            await transporter.sendMail(mailOptions);
            console.log("✅ Email di test inviata con successo!");

            return {
                success: true,
                message: `Test completato con successo! Email di test inviata a ${testEmail}`,
                details: {
                    smtpHost: smtpConfig.host,
                    smtpPort: smtpConfig.port,
                    secure: smtpConfig.secure,
                    testEmailSent: true,
                    testEmailRecipient: testEmail
                }
            };
        } else {
            // Solo verifica connessione, nessuna email di test
            return {
                success: true,
                message: "Connessione SMTP verificata con successo!",
                details: {
                    smtpHost: smtpConfig.host,
                    smtpPort: smtpConfig.port,
                    secure: smtpConfig.secure,
                    testEmailSent: false
                }
            };
        }

    } catch (error) {
        console.error("❌ Errore nel test SMTP:", error);

        // Fornisci messaggi di errore più specifici
        let errorMessage = "Errore durante il test della configurazione SMTP.";

        // Controlla prima se è un nostro errore personalizzato
        if (error.message && error.message.startsWith("❌")) {
            errorMessage = error.message;
        }
        // Gestisci gli errori di nodemailer
        else if (error.code === 'EAUTH') {
            errorMessage = "❌ Autenticazione fallita. Verifica username e password SMTP.";
        } else if (error.code === 'ECONNREFUSED') {
            errorMessage = "❌ Connessione rifiutata. Verifica host e porta SMTP.";
        } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKET') {
            errorMessage = "❌ Timeout della connessione. Verifica che il server SMTP sia raggiungibile.";
        } else if (error.code === 'EDNS') {
            errorMessage = "❌ Host SMTP non trovato. Verifica l'indirizzo del server.";
        } else if (error.code === 'ENOTFOUND') {
            errorMessage = "❌ Server SMTP non trovato. Verifica l'host configurato.";
        } else if (error.responseCode === 535) {
            errorMessage = "❌ Credenziali SMTP non valide. Verifica username e password.";
        } else if (error.message && error.message.includes("Invalid login")) {
            errorMessage = "❌ Login non valido. Verifica le credenziali SMTP.";
        } else if (error.message) {
            errorMessage = `❌ Errore SMTP: ${error.message}`;
        }

        // Log dettagliato per debugging
        console.error("Dettagli errore SMTP:", {
            code: error.code,
            message: error.message,
            responseCode: error.responseCode,
            command: error.command
        });

        throw new Error(errorMessage);
    }
});
