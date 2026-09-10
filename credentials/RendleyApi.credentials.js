"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RendleyApi = void 0;
class RendleyApi {
    constructor() {
        this.name = 'rendleyApi';
        this.displayName = 'Rendley API';
        this.icon = { light: 'file:rendley.svg', dark: 'file:rendley.dark.svg' };
        this.documentationUrl = 'https://docs.rendley.com/api/authentication';
        this.properties = [
            {
                displayName: 'API Key',
                name: 'apiKey',
                type: 'string',
                typeOptions: { password: true },
                default: '',
                required: true,
                description: 'Your Rendley API key. Create one at app.rendley.com/settings.',
            },
            {
                displayName: 'API Base URL',
                name: 'apiBaseUrl',
                type: 'string',
                default: 'https://api.rendley.com/v1',
                description: 'Base URL of the Rendley API. Leave the default unless Rendley gave you a different host.',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '=Bearer {{$credentials.apiKey}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.apiBaseUrl}}',
                url: '/users/me',
            },
        };
    }
}
exports.RendleyApi = RendleyApi;
