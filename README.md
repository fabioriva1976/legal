
## Login

docker compose exec firebase_legal firebase login

## Init

docker compose exec firebase_legal firebase init

## Deploy

docker compose exec firebase_legal firebase deploy

## Deploy solo funzioni

docker compose exec firebase_legal firebase deploy --only functions

## Entrare nel container per nmp

docker exec -it firebase_legal sh
cd /app/functions
npm install


## Attivare emulatore per sviluppo locale

docker exec -it firebase_legal sh
cd /app

firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data

## Per aggiornare gli indici del DB da remoto a locale

firebase firestore:indexes > firestore.indexes.json



## Accedere all'UI degli emulatori

http://localhost:4000


## Eseguire i cron

docker exec -it firebase_legal sh
cd /app

firebase functions:shell

mailSenderGoogleCron()


## Configurazione AI

Le chiavi API per i servizi AI (OpenAI, Google Gemini, Anthropic, Azure) vengono configurate tramite l'interfaccia web:

1. Accedi all'applicazione
2. Vai su Profilo > Agenti AI
3. Seleziona il provider e inserisci la tua API key
4. Testa la configurazione prima di salvare