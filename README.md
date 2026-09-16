# Gift---Pool

A React + Vite frontend for tracking a farewell gift pool and settling balances fairly.

## Features

- set a total gift budget
- enter any number of contributors and their payments
- calculate equal share per person
- show each person's balance and how much is still owed/overpaid
- detect the easiest fair settlement plan
- import messy contribution data with duplicates, formatting issues, and invalid rows
- clean and merge imported entries before calculating balances

## Tech stack

- React.js
- JavaScript
- Tailwind CSS
- Vite

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Run the app locally:
   ```bash
   npm run dev
   ```
3. Open the local URL shown in the terminal, typically:
   ```bash
   http://localhost:5173/
   ```

## Production build

```bash
npm run build
```

To preview the production build locally:

```bash
npm run preview
```

## Debugging

- If the UI looks wrong, restart the dev server with `npm run dev`.
- If the pool totals seem off, check the names and payment values entered in the Team members and Messy import boxes.
- If imported rows are being rejected, confirm the row includes a valid name and a numeric amount.
- If needed, refresh the page to reset the in-memory demo state.

## Notes

This project is designed for organisers handling shared contribution pools where people may have paid different amounts, some may have paid extra, and a final settlement list is needed to make everyone end up square.
