import { clientFor, toUserError, type Bundle, type InputField, type ZObject } from "./lib/zapier";

const fields: InputField[] = [
  {
    key: "apiKey",
    label: "API Key",
    type: "password",
    required: true,
    helpText:
      "Create an API key in your Rendley account under [Settings → API keys](https://app.rendley.com/settings). AI actions, agent edits and exports need an active subscription and credits.",
  },
  {
    key: "apiBaseUrl",
    label: "API Base URL",
    type: "string",
    required: false,
    default: "https://api.rendley.com/v1",
    helpText:
      "Advanced: leave the default unless Rendley gave you a different API host. Must be an HTTPS URL, see the [Rendley API documentation](https://docs.rendley.com/api/getting-started).",
  },
];

/** Runs when the user connects; a bad key throws and Zapier flags the connection. */
const test = async (z: ZObject, bundle: Bundle) => {
  const baseUrl = (bundle.authData.apiBaseUrl || "").trim();
  if (baseUrl && !/^https:\/\/[a-z0-9.-]+(\/[a-z0-9./_-]*)?$/i.test(baseUrl)) {
    throw new z.errors.Error("The API Base URL must be an https:// URL such as https://api.rendley.com/v1.");
  }
  try {
    const workspaces = await clientFor(bundle).listWorkspaces();
    return { workspaces: workspaces.length };
  } catch (err) {
    throw toUserError(z, err);
  }
};

/** Short label without secrets: the first workspace name. */
const connectionLabel = async (_z: ZObject, bundle: Bundle): Promise<string> => {
  try {
    const workspaces = await clientFor(bundle).listWorkspaces();
    const name = workspaces[0]?.name;
    return name ? String(name).slice(0, 60) : "Rendley";
  } catch {
    return "Rendley";
  }
};

const authentication = {
  type: "custom" as const,
  fields,
  test,
  connectionLabel,
};

export default authentication;
