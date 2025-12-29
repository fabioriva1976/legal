
## Login

docker compose exec firebase_cli firebase login

## Init

docker compose exec firebase_cli firebase init

## Deploy

docker compose exec firebase_cli firebase deploy

## Deploy solo funzioni

docker compose exec firebase_cli firebase deploy --only functions

## Entrare nel container per nmp

docker exec -it firebase_cli sh
cd /app/functions
npm install


## Attivare emulatore per sviluppo locale

docker exec -it firebase_cli sh
cd /app

firebase emulators:start --import=./emulator-data --export-on-exit=./emulator-data


## Accedere all'UI degli emulatori

http://localhost:4000


## Eseguire i cron

docker exec -it firebase_cli sh
cd /app

firebase functions:shell

mailSenderGoogleCron()



