# OneWineMarket supplier product intake

Suppliers send product information and files. Each submission:

1. Creates a folder under [OWM Supplier Product Submissions](https://drive.google.com/drive/folders/1pmImjkziGdmUpCo2TWWc5wHcwLXl1EbX)
2. Uploads bottle photos, extra images, and documents
3. Emails a thank-you to the supplier (if an email was given)
4. Notifies `info@onewinemarket.com`, `erika@onewinemarket.com`, and `info@shopwineslash.com`

All form fields are optional.

## Live URLs

- Form: https://winekid007.github.io/owm-supplier-intake/index.html
- Drive API: https://owm-supplier-intake.vercel.app/api/submit
- BigCommerce paste-in: `owm-web-page.html` (full branded page) or `owm-bc-iframe.html` (iframe wrapper)
- Target OneWineMarket URL: `/supplier-product/`

## Vercel Drive env

Set these on project `owm-supplier-intake` so file uploads land in Google Drive:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `DRIVE_PARENT_FOLDER_ID=1pmImjkziGdmUpCo2TWWc5wHcwLXl1EbX`
