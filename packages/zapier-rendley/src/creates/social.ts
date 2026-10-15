import { clientFor, str, toUserError, urlList, type Create, type OutputField, type ZObject } from "../lib/zapier";
import type { SocialPost } from "@rendley/client";

function postOutput(posts: SocialPost[]): Record<string, unknown> {
  const failed = posts.filter((p) => p.status === "failed");
  return {
    id: posts[0].id,
    post_ids: posts.map((p) => p.id).join(","),
    status: posts[0].status,
    scheduled_at: posts[0].scheduled_at ?? null,
    posted_count: posts.length - failed.length,
    failed_count: failed.length,
    errors: failed.map((p) => `${p.account_username ?? p.platform}: ${p.error ?? "failed"}`).join("; ") || null,
    posts,
  };
}

const POST_OUTPUT_FIELDS: OutputField[] = [
  { key: "id", label: "Post ID (first account)" },
  { key: "post_ids", label: "Post IDs" },
  { key: "status", label: "Status" },
  { key: "scheduled_at", label: "Scheduled At", type: "datetime" },
  { key: "posted_count", label: "Accounts Posted", type: "integer" },
  { key: "failed_count", label: "Accounts Failed", type: "integer" },
  { key: "errors", label: "Errors" },
];

const POST_SAMPLE = {
  id: "0f4b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
  post_ids: "0f4b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
  status: "processing",
  scheduled_at: null,
  posted_count: 1,
  failed_count: 0,
  errors: null,
  posts: [
    {
      id: "0f4b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d",
      caption: "Three habits that actually stick #productivity",
      platform: "x",
      account_username: "rendleyhq",
      scheduled_at: null,
      created_at: "2026-10-14T09:00:00Z",
      status: "processing",
    },
  ],
};

export const publishSocialPost: Create<{
  workspace_id?: string;
  account_ids: string[];
  media_url: string;
  caption?: string;
  scheduled_at?: string;
  project_id?: string;
}> = {
  key: "publish_social_post",
  noun: "Social Post",
  display: {
    label: "Publish Social Post",
    description:
      "Posts a video or image to the social accounts connected in Rendley, right away or at a scheduled time.",
  },
  operation: {
    inputFields: [
      {
        key: "workspace_id",
        label: "Workspace",
        type: "string",
        required: false,
        dynamic: "list_workspaces.id.name",
        helpText: "Workspace whose connected accounts to use. Leave empty for your first workspace.",
      },
      {
        key: "account_ids",
        label: "Accounts",
        type: "string",
        list: true,
        required: true,
        dynamic: "list_social_accounts.id.name",
        helpText: "Accounts to post to. Connect them in the Rendley app under Social media.",
      },
      {
        key: "media_url",
        label: "Media URL",
        type: "string",
        required: true,
        helpText:
          "Public HTTPS link to an MP4/MOV video or a JPEG/PNG/WEBP/GIF image, for example the URL from Export Video or Find Job Status. Rendley copies the file for scheduled posts, so the link may expire before the post goes out.",
      },
      {
        key: "caption",
        label: "Caption",
        type: "text",
        required: false,
        helpText: "Text of the post. Each platform's limit applies, for example 280 characters on X.",
      },
      {
        key: "scheduled_at",
        label: "Schedule For",
        type: "datetime",
        required: false,
        helpText: "When to publish. Leave empty to publish now. Scheduled posts show up in the Rendley content calendar.",
      },
      {
        key: "project_id",
        label: "Project",
        type: "string",
        required: false,
        dynamic: "new_project.id.name",
        helpText: "Rendley project the media comes from, shown with the post in the content calendar.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const { workspace_id, account_ids, media_url, caption, scheduled_at, project_id } = bundle.inputData;
      try {
        const posts = await clientFor(bundle).createSocialPost({
          workspaceId: str(workspace_id),
          accountIds: urlList(account_ids) ?? [],
          mediaUrl: media_url,
          caption,
          scheduledAt: str(scheduled_at),
          projectId: str(project_id),
        });
        return postOutput(posts);
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: POST_SAMPLE,
    outputFields: POST_OUTPUT_FIELDS,
  },
};

export const cancelSocialPost: Create<{ workspace_id?: string; post_id: string }> = {
  key: "cancel_social_post",
  noun: "Social Post",
  display: {
    label: "Cancel Scheduled Social Post",
    description: "Cancels a scheduled post before it goes out.",
  },
  operation: {
    inputFields: [
      {
        key: "workspace_id",
        label: "Workspace",
        type: "string",
        required: false,
        dynamic: "list_workspaces.id.name",
        helpText: "Workspace the post belongs to, for the Post dropdown. Leave empty for your first workspace.",
      },
      {
        key: "post_id",
        label: "Post",
        type: "string",
        required: true,
        dynamic: "list_scheduled_social_posts.id.name",
        helpText: "The scheduled post to cancel. Map Post ID from Publish Social Post, or pick one from the list.",
      },
    ],
    perform: async (z: ZObject, bundle) => {
      const postId = bundle.inputData.post_id;
      try {
        await clientFor(bundle).cancelSocialPost(postId);
        return { id: postId, post_id: postId, canceled: true };
      } catch (err) {
        throw toUserError(z, err);
      }
    },
    sample: { id: "0f4b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d", post_id: "0f4b1c2d-3e4f-4a5b-8c6d-7e8f9a0b1c2d", canceled: true },
    outputFields: [
      { key: "post_id", label: "Post ID" },
      { key: "canceled", label: "Canceled", type: "boolean" },
    ],
  },
};
