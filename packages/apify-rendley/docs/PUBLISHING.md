# Publishing the Rendley Actor on Apify Store

Sources: Apify's [publishing overview](https://docs.apify.com/platform/actors/publishing), [publish on Store](https://docs.apify.com/actors/publishing/publish), [README guide](https://docs.apify.com/actors/publishing/actor-readme), [quality score](https://docs.apify.com/actors/publishing/quality-score) and the [actor.json reference](https://docs.apify.com/platform/actors/development/actor-definition/actor-json).

## What Apify requires

- **Actor definition.** `.actor/actor.json` with name, title, description, version, input schema and Dockerfile. `apify validate-schema` must pass (it does: `npm test`).
- **Publication tab.** Logo, description, categories, sample output, output schema and least-privilege permissions, then "Publish on Store".
- **README.** Clear, detailed and concise, at least 300 words, H2/H3 headings that carry keywords (Apify feeds them to search engines), a pricing section, input and output examples and an FAQ. The current README follows the guide with question-style headings.
- **Quality score.** Rewards an input schema, a high run success rate, clear titles and descriptions, transparent pricing and minimal permissions.
- **Maintenance.** Apify expects about two hours a week of upkeep and asks that breaking changes be announced in advance.
- **Secrets.** The API key input is marked `isSecret`, so Apify encrypts it and keeps it out of logs and datasets.

## Steps

1. **Log in and push** (once, from this folder):
   ```bash
   npx apify login
   npm test                  # validates the schemas and runs the offline checks
   RENDLEY_API_KEY=... npm run test:live
   npm run push              # creates rendley/rendley-ai-video-editor
   ```
2. **Fill in the Publication tab** in the Apify Console: upload `assets/rendley-mark-on-graphite-512.png` as the logo, set the categories (AI, Video, Automation), the SEO title and description below, choose the pricing model (a free Actor where users pay Rendley credits is the simplest) and set permissions to the minimum.
3. **Run it once from the Console** with your own key so the Store page shows a successful run, then click *Publish on Store*.
4. **After publishing**, add the Store link to the GitHub repository description and keep the README's pricing section current.

## Listing copy

- Title: `Rendley AI Video Editor`
- Description: *Turn a prompt into an edited, rendered video, or run Rendley's AI actions: text to speech, transcription, dubbing, image, video and music generation, background removal and MP4 export.*
- SEO title: *Rendley AI Video Editor: prompt to video, TTS, dubbing and rendering on Apify*
- Categories: AI, Video, Automation

## Checklist

- [ ] `npm test` and `npm run test:live` pass.
- [ ] Actor pushed and visible under the Rendley Apify account.
- [ ] Publication tab complete: logo, categories, description, SEO title, pricing, permissions.
- [ ] One successful public run from the Console.
- [ ] Published on Store; link added to the GitHub repository.
