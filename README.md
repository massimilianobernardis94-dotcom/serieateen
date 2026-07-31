# Serie A Teen — Area Presidenti

Sito della lega fantacalcio **Serie A Teen**: regolamento, votazioni e proposte dei Presidenti.
Frontend in JavaScript vanilla, database e autenticazione su **Supabase**, deploy su **Vercel**.

## Cosa fa

- **Login / Registrazione** con *nome società* + password (nessuna email, nessuna conferma). Dopo la registrazione sei loggato in automatico.
- **SPORTING BUBA** è l'amministratore di lega: è l'unico che può creare e archiviare le votazioni.
- **Regolamento**: il testo ufficiale, sempre consultabile.
- **Votazioni**: sotto-schede *Aperte* e *Archiviate*. I Presidenti votano (un voto a testa, modificabile finché è aperta); l'admin crea e archivia. Le archiviate sono in sola lettura.
- **Proposte**: bacheca in stile blog. Ogni Presidente può aggiungere una proposta; sulla card si legge chi l'ha scritta. Solo l'autore o l'admin possono modificarla o eliminarla.
- **Profilo**: avatar con le iniziali della società, con logout e cambio nome società.

## Struttura

```
serie-a-teen/
├── api/
│   └── config.js          # espone URL + anon key pubblici (serverless Vercel)
├── public/
│   ├── index.html
│   ├── logo.svg
│   ├── regolamento.html   # regolamento renderizzato
│   ├── css/style.css
│   └── js/
│       ├── app.js         # tutta la logica dell'app
│       └── supabase.js    # inizializza il client
├── sql/
│   └── schema.sql         # tabelle + Row Level Security (da eseguire su Supabase)
├── vercel.json
└── .env.example
```

## Setup passo-passo

### 1. Supabase
1. Crea un progetto su [supabase.com](https://supabase.com).
2. Vai su **SQL Editor** e incolla/esegui tutto il contenuto di `sql/schema.sql`.
3. Vai su **Authentication → Providers → Email** e **disattiva** "Confirm email" (così la registrazione logga subito).
4. In **Project Settings → API** copia `Project URL` e `anon public key`.

### 2. Variabili d'ambiente
Su Vercel (o in `.env.local` per il locale) imposta:

```
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
```

### 3. Deploy su Vercel
- Collega il repo GitHub a Vercel **oppure** dalla cartella esegui `vercel`.
- Non serve build: è un sito statico + una funzione serverless. Lascia il framework su "Other".
- Aggiungi le due variabili d'ambiente nel progetto Vercel e fai il deploy.

### 4. Crea l'admin
Registra la società con nome esatto **`SPORTING BUBA`** e password `ReFanta1994!`.
Il trigger nel database la marca automaticamente come amministratore.

> La regola admin è nel file `sql/schema.sql` (funzione `handle_new_user`): se cambi nome o password dell'admin, aggiornala lì.

## Note sulla sicurezza

- La *anon key* è pubblica per definizione: può stare nel client. La protezione reale è data dalle **RLS policy** nel database, che impediscono a chiunque di creare votazioni o modificare proposte altrui, a prescindere dal frontend.
- Il nome società viene trasformato in un'email tecnica interna (`nome@serieateen.local`) usata solo da Supabase Auth. Non è una mail reale e l'utente non la vede mai.
