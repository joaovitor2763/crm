import { AccessControlService } from "../access-control/access-control.service";
import { ApiCredentialsService } from "../api-credentials/api-credentials.service";

export async function publicPrincipal(
	authorization: string | undefined,
	credentials: ApiCredentialsService,
	accessControl: AccessControlService,
) {
	const credentialId = await credentials.authenticate(authorization);
	return accessControl.forApiCredential(credentialId);
}
