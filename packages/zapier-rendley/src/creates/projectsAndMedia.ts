import { URL_EXPIRY_NOTE, clientFor, toUserError, type Bundle, type Create, type ZObject } from "../lib/zapier";

export const createProject: Create<{ name: string; workspace_id?: string; template?: string }> = {
  key: "create_project",
  noun: "Project",
  display: {
    label: "Create Project",
    description: "Creates a new Rendley project, optionally from a template.",
  },
  operation: {
    inputFields: [
      {
        key: "name",
        label: "Name",
        type: "string",
        required: true,
        helpText: "The project name shown in Rendley.",
      },
      {
        key: "workspace_id",
        label: "Workspace",
        type: "string",
        required: false,
        dynamic: "list_workspaces.id.name",
        helpText: "Optional: defaults to your first workspace.",
      },
      {
        key: "template",
        label: "Template ID",
        type: "string",
        required: false,
        helpText: "Optional: the ID of a Rendley template to start the project from.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const { name, workspace_id, template } = bundle.inputData;
      try {
        const project = await clientFor(bundle).createProject({
          name,
          workspaceId: workspace_id || undefined,
          templateId: template || undefined,
        });
        return { id: project.id, name: project.name, workspace_id: project.workspace_id };
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: {
      id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
      name: "Product launch teaser",
      workspace_id: "3b66b9b6-de8e-44c3-9f27-848a09c79320",
    },
    outputFields: [
      { key: "id", label: "Project ID" },
      { key: "name", label: "Name" },
      { key: "workspace_id", label: "Workspace ID" },
    ],
  },
};

export const uploadMedia: Create<{ project_id: string; file_url: string; file_name?: string }> = {
  key: "upload_media",
  noun: "Media File",
  display: {
    label: "Upload Media From URL",
    description:
      "Adds a file from a public URL to a project's media library. Rendley fetches the file itself, so there is no size limit through Zapier. " +
      URL_EXPIRY_NOTE,
  },
  operation: {
    inputFields: [
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: true,
        dynamic: "new_project.id.name",
        helpText: "The project whose library the file is added to.",
      },
      {
        key: "file_url",
        label: "File URL",
        type: "string",
        required: true,
        helpText: "A publicly reachable URL of the video, audio or image. Files from earlier Zap steps work when they expose a URL.",
      },
      {
        key: "file_name",
        label: "File Name",
        type: "string",
        required: false,
        helpText: "Optional name shown in the project library. Defaults to the name in the URL.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const { project_id, file_url, file_name } = bundle.inputData;
      try {
        const upload = await clientFor(bundle).importUpload(project_id, {
          downloadUrl: file_url.trim(),
          fileName: file_name || undefined,
        });
        return {
          id: upload.media_id ?? upload.file_hash,
          media_id: upload.media_id ?? null,
          file_hash: upload.file_hash ?? null,
          file_name: upload.original_file_name ?? file_name ?? null,
          mime_type: upload.mime_type ?? null,
          status: upload.status ?? null,
          url: upload.storage_url ?? null,
          project_id,
        };
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: {
      id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
      media_id: "c448b6e3-2b78-4bda-b369-d1afc6aec07f",
      file_hash: "c6c8ec4f9a6fdd9d",
      file_name: "interview.mp4",
      mime_type: "video/mp4",
      status: "complete",
      url: "https://storage.rendley.com/user_uploads/1fdfc335/c6c8ec4f9a6fdd9d?signature=abc",
      project_id: "1fdfc335-a483-4f8d-8466-8dae94175cc6",
    },
    outputFields: [
      { key: "media_id", label: "Media ID" },
      { key: "file_hash", label: "File Hash" },
      { key: "file_name", label: "File Name" },
      { key: "mime_type", label: "MIME Type" },
      { key: "status", label: "Status" },
      { key: "url", label: "Download URL (signed, expires)" },
      { key: "project_id", label: "Project ID" },
    ],
  },
};
