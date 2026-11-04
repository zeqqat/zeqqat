import { describe, expect, it } from "vitest";
import { scrubSecrets } from "../../lib/scrub";

// Every value below is fake, shaped like the real thing. This repo is
// public: never paste real credentials into a test case.
const cases: { name: string; input: unknown; mustRedact: string[]; mustKeep: string[] }[] = [
  {
    // The env block Dokploy's application.one returns.
    name: "dokploy env block",
    input: {
      env: [
        "NODE_ENV=production",
        "PORT=3000",
        "DATABASE_URL=postgresql://postgres:fakepassw0rd1234@host:5432/zeqqat",
        "GOOGLE_CLIENT_ID=000000000000-fakeclientidfakeclientidfakecli.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET=GOCSPX-FakeFakeFakeFakeFakeFake0000",
        "BETTER_AUTH_SECRET=ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtlZmFrZWZha2U=",
        "ZEQQAT_ENCRYPTION_KEY=bm90YXJlYWxrZXlub3RhcmVhbGtleW5vdGFyZWFsa2U=",
        "STRIPE_API_KEY=sk_live_abc123",
        "SIGNING_KEY=deadbeef",
      ].join("\n"),
    },
    mustRedact: [
      "fakepassw0rd1234",
      "GOCSPX-FakeFakeFakeFakeFakeFake0000",
      "ZmFrZWZha2VmYWtlZmFrZWZha2VmYWtl",
      "bm90YXJlYWxrZXlub3RhcmVhbGtleW5vdGFyZWFsa2U=",
      "sk_live_abc123",
      "deadbeef",
    ],
    mustKeep: ["NODE_ENV=production", "PORT=3000", "000000000000-fakeclientidfakeclientidfakecli"],
  },
  {
    name: "identifier fields must survive",
    input: {
      applicationId: "aBcDeFgHiJkLmNoPqRsTu",
      projectId: "0aB1cD2eF3gH4iJ5kL_6m",
      appName: "exampleapp-exampleappdev-abc123",
      customGitSSHKeyId: "abc-123",
      keyId: "kid-77",
      monkey: "banana",
      applicationStatus: "done",
    },
    mustRedact: [],
    mustKeep: ["aBcDeFgHiJkLmNoPqRsTu", "0aB1cD2eF3gH4iJ5kL_6m", "exampleapp-exampleappdev-abc123", "abc-123", "kid-77"],
  },
  {
    name: "secret-ish object keys",
    input: {
      apiKey: "sk_live_should_vanish",
      encryptionKey: "aes_should_vanish",
      accessToken: "tok_should_vanish",
      nested: { database_url: "postgres://u:hunter2@h/db", refreshToken: "rt_should_vanish" },
    },
    mustRedact: ["sk_live_should_vanish", "aes_should_vanish", "tok_should_vanish", "hunter2", "rt_should_vanish"],
    mustKeep: [],
  },
  {
    name: "credentials embedded in a url inside log text",
    input: "connecting to mongodb://admin:p4ssw0rd@cluster.example.com/db ... ok",
    mustRedact: ["p4ssw0rd"],
    mustKeep: ["cluster.example.com", "admin"],
  },
  {
    // Dokploy domain fields. Settings, not secrets: agents need them to debug SSL.
    name: "domain ssl settings must survive",
    input: {
      domainId: "dom_123",
      host: "app.example.com",
      certificateType: "letsencrypt",
      previewCertificateType: "none",
      customCertResolver: "myresolver",
      uniqueConfigKey: 42,
      https: true,
    },
    mustRedact: [],
    mustKeep: ['"certificateType":"letsencrypt"', '"previewCertificateType":"none"', "myresolver", '"uniqueConfigKey":42'],
  },
  {
    // Secrets under names that say nothing about secrets.
    name: "env values caught by shape, not name",
    input: {
      env: [
        "STRIPE=sk_live_51FakeFakeFakeFake",
        "HOOK=whsec_FakeFakeFakeFake00",
        "GH=ghp_FakeFakeFakeFakeFakeFakeFakeFake0000",
        "THING=Zm9vYmFyQmF6UXV4MTIzNDU2Nzg5MGFiY2Rl",
        "OPENAI=sk-proj-FakeFakeFakeFakeFakeFake0000",
        "CACHE=redis://:r3disp4ss@cache:6379",
        "IMAGE_TAG=3f9c2a1b7e4d5c6f8a9b0c1d2e3f4a5b6c7d8e9f",
        "APP_URL=https://app.example.com",
        "NODE_ENV=production",
        "LOG_LEVEL=info",
      ].join("\n"),
    },
    mustRedact: [
      "sk_live_51FakeFakeFakeFake",
      "whsec_FakeFakeFakeFake00",
      "ghp_FakeFakeFakeFakeFakeFakeFakeFake0000",
      "Zm9vYmFyQmF6UXV4MTIzNDU2Nzg5MGFiY2Rl",
      "sk-proj-FakeFakeFakeFakeFakeFake0000",
      "r3disp4ss",
    ],
    mustKeep: [
      "IMAGE_TAG=3f9c2a1b7e4d5c6f8a9b0c1d2e3f4a5b6c7d8e9f",
      "APP_URL=https://app.example.com",
      "NODE_ENV=production",
      "LOG_LEVEL=info",
    ],
  },
  {
    // The shape of a Dokploy application with a GitHub provider attached:
    // the githubPrivateKey-style fields from the CVE.
    name: "github provider fields",
    input: {
      applicationId: "app_1",
      sourceType: "github",
      github: {
        githubId: "gh_1",
        githubAppName: "my-dokploy-app",
        githubAppId: 123456,
        githubClientId: "Iv1.0123456789abcdef",
        githubClientSecret: "fakeclientsecret0000000000000000",
        githubInstallationId: "7890",
        githubPrivateKey: "-----BEGIN RSA PRIVATE KEY-----\nMIIEfakefakefake\n-----END RSA PRIVATE KEY-----",
        githubWebhookSecret: "fakewebhooksecret",
      },
      gitlab: { gitlabId: "gl_1", accessToken: "glpat-FakeFakeFakeFakeFake00", refreshToken: "rt_fake", secret: "glsecret" },
      bitbucket: { bitbucketUsername: "me", appPassword: "bbapppass", apiToken: "bbtoken" },
      gitea: { clientId: "gitea_client", clientSecret: "giteasecret", accessToken: "giteatoken" },
    },
    mustRedact: [
      "fakeclientsecret0000000000000000",
      "MIIEfakefakefake",
      "fakewebhooksecret",
      "glpat-FakeFakeFakeFakeFake00",
      "rt_fake",
      "glsecret",
      "bbapppass",
      "bbtoken",
      "giteasecret",
      "giteatoken",
    ],
    mustKeep: ["my-dokploy-app", "123456", "Iv1.0123456789abcdef", "7890", '"sourceType":"github"', "gitea_client", '"bitbucketUsername":"me"'],
  },
  {
    // A key pasted into a free-text field (compose file, build log).
    name: "private key and jwt inside free text",
    input: {
      composeFile: "services:\n  app:\n    environment:\n      KEY_MATERIAL: |\n        -----BEGIN OPENSSH PRIVATE KEY-----\n        b3BlbnNzaC1rZXktdjEfake\n        -----END OPENSSH PRIVATE KEY-----\n",
      log: "auth header: eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.fakeSignatureFake",
    },
    mustRedact: ["b3BlbnNzaC1rZXktdjEfake", "eyJzdWIiOiIxMjM0In0"],
    mustKeep: ["services:", "auth header:"],
  },
  {
    name: "flags and plain words that merely contain secret-ish letters",
    input: { monkey: "banana", passThrough: "yes", isPasswordSet: true, hasKey: false, keyName: "deploy" },
    mustRedact: [],
    mustKeep: ["banana", '"passThrough":"yes"', '"isPasswordSet":true', '"hasKey":false', "deploy"],
  },
];

describe("scrubSecrets", () => {
  it.each(cases)("$name", ({ input, mustRedact, mustKeep }) => {
    const out = JSON.stringify(scrubSecrets(input));
    for (const needle of mustRedact) expect(out, `leaked: ${needle}`).not.toContain(needle);
    for (const needle of mustKeep) expect(out, `over-redacted: ${needle}`).toContain(needle);
  });
});
