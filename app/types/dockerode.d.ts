// Type declaration for dockerode (no @types/dockerode installed).
//
// dockerode is imported statically in app/lib/docker-sandbox.ts so Next.js
// standalone tracing includes it, but we only interact with it through our own
// minimal `DockerClient` interface — so an untyped declaration is enough.
declare module "dockerode";
