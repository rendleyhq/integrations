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
];

/** Runs when the user connects; a bad key throws and Zapier flags the connection. */
const test = async (z: ZObject, bundle: Bundle) => {
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
