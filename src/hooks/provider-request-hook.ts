"use strict";

/**
 * omp-noesis: Provider Request Hook
 * Version: 1.0.0
 *
 * Intercepts outgoing provider requests (the raw HTTP body sent to the LLM
 * API) and adapts tool JSON Schemas for the target model family.
 *
 * Registered on the `before_provider_request` event of the ExtensionAPI,
 * which gives us access to the raw payload before it hits the wire.
 * The handler receives the payload, transforms it, and returns the
 * modified version.  Multiple handlers compose in registration order
 * (each sees the output of the previous), so we keep it focused.
 */

import type { ExtensionAPI, BeforeProviderRequestEvent, BeforeProviderRequestEventResult } from "@oh-my-pi/pi-coding-agent";
import { adaptProviderPayload, adaptToolChoice, detectFamilyFromPayload } from "../shared/provider-schema.js";

/**
 * Register the provider-request adaptation hook.
 * Must be called during extension activation.
 */
export function registerProviderRequestHook(pi: ExtensionAPI): void {
  pi.on("before_provider_request", async (event: BeforeProviderRequestEvent): Promise<BeforeProviderRequestEventResult> => {
    const adapted = adaptProviderPayload(event.payload);
    const family = detectFamilyFromPayload(event.payload as Record<string, unknown>);
    return adaptToolChoice(adapted, family);
  });
}
