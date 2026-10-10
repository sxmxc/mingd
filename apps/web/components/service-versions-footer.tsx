import { BUILD_RECIPE_VERSION } from "@mingd/build-config";
import { gatewayServiceVersion, WEB_IMAGE_TAG, WEB_SERVICE_VERSION } from "@/lib/service-versions";

export function ServiceVersionsFooter({ gateway }: { gateway: Awaited<ReturnType<typeof gatewayServiceVersion>> }) {
  return <footer aria-label="Service versions" className="mt-10 border-t border-[var(--border)] pt-4 text-xs text-[var(--muted)]">
    Web image {WEB_IMAGE_TAG ?? "local build"} · package v{WEB_SERVICE_VERSION} · recipe {BUILD_RECIPE_VERSION}
    <span className="mx-3" aria-hidden="true">|</span>
    {gateway ? <>Gateway image {gateway.imageTag === undefined ? "not reported" : gateway.imageTag ?? "local build"} · package v{gateway.serviceVersion} · recipe {gateway.buildRecipeVersion}</> : "Gateway version unavailable"}
  </footer>;
}

export async function LiveServiceVersionsFooter() {
  return <ServiceVersionsFooter gateway={await gatewayServiceVersion()} />;
}
