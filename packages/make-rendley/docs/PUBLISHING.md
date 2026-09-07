# Publishing the Rendley app on Make

Sources: Make's [app review overview](https://developers.make.com/custom-apps-documentation/app-review/overview) and [prerequisites](https://developers.make.com/custom-apps-documentation/app-review/prerequisites).

## What Make requires

Quoted from the prerequisites:

- "Your custom app uses a web service that is not already available in Make."
- "Your custom app has to use only credentials that the service requires to create a connection." (Done: one API key.)
- "The base and connection have sanitization of sensitive data" and "error handling." (Done: `base.imljson` maps `error.code` and `error.message`; the connection verifies the key against `/workspaces`.)
- "Modules have correct labels and descriptions." (Done: `metadata.imljson` per module.)
- "The app has a universal module." (Done: Make an API Call.)
- "All modules have the correct interface depending on the output from the module." (Done and checked by the live harness.)
- "Search modules, trigger modules, and RPCs have a limit parameter" and pagination where the API supports it. (Done: `limit` on both search modules; the Rendley list endpoints return a bounded set without cursor pagination.)
- "You must create test scenarios to show that the custom app works", "Use each module of the custom app in at least one test scenario", and "Make sure that the testing scenarios and their execution logs don't contain personal or sensitive data."
- "Run your search and list modules to have logs with pagination."

App metadata needed in the Apps Editor: name (`Rendley`), description, a square logo, theme color, language English, and a support contact.

## Steps

1. **Create the app in Make.** Either paste each file into the matching tab of the Apps Editor (Base, Connection Communication and Parameters, each RPC, each module's Communication, Mappable parameters, Interface, Samples, label and description), or use the Make Apps SDK for VS Code: add the environment, create a new origin, fill `appId` and the region `baseUrl` in `makecomapp.json`, store the Make API key in `.secrets/make-apikey`, and *Deploy to Make*.
2. **Set module types** as in the table in the README: `listProjects` and `getWorkspaces` are *search* modules, `makeApiCall` is the *universal* module, everything else is an *action*. Attach the Rendley connection to every module and RPC.
3. **Test scenarios.** Build one scenario per module (Make checks each module appears in at least one), run the search modules so the logs show `limit` in use, and keep the logs free of personal data. The polling pattern for jobs is in the README.
4. **Keep the app private until it passes.** Publication is irreversible; invite testers with the app's invite link first.
5. **Request review** in the Developer Hub (Custom Apps → App review → Request app review) with the app name, categories, API docs link (`https://docs.rendley.com`), service URL, logo, support contact and trademark confirmation.

## Updating a published app

Make keeps a production and a testing version of an approved app. Develop against the testing origin, pull, commit here, then deploy to production and re-request review for changes that alter modules.
