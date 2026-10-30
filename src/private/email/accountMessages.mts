import { escapeHtml } from './escapeHtml.mjs'
import type { IEmailContent } from './IEmailContent.mjs'
import { fixName, htmlLink } from './messageParts.mjs'

/** Registration confirmation. `link` is the finished confirmation URL. */
export function verifyMessage(platformName: string, link: string, name: string): IEmailContent {
	const nameFixed = fixName(name)
	const platform = escapeHtml(platformName)
	return {
		subject: `Confirm your email for ${platformName}`,
		textBody: `Hi${nameFixed}, you or someone else is registering you on ${platformName}.
      You can confirm the registration by copying this link ${link} into your browser. The Team`,
		htmlBody: `Hi${escapeHtml(nameFixed)},<br>you or someone else is registering you on ${platform}.<br><br>
      You can confirm the registration by visiting this link ${htmlLink(link)}<br><br>
      <br><br>The Team`
	}
}

/** Email-change confirmation. `link` is the finished confirmation URL. */
export function changeVerifyMessage(platformName: string, link: string, name: string): IEmailContent {
	const nameFixed = fixName(name)
	return {
		subject: `Confirm your email for ${platformName}`,
		textBody: `Hi${nameFixed}, you or someone else has changed the email you sign in with.
      You can confirm by copying this link ${link} into your browser. The Team.`,
		htmlBody: `Hi${escapeHtml(nameFixed)},<br>you or someone else has changed the email you sign in with.<br><br>
      You can confirm the registration by visiting this link ${htmlLink(link)}
      <br><br>The Team.`
	}
}

/** Welcome mail linking to the platform home. */
export function welcomeMessage(platformName: string, linkBase: string): IEmailContent {
	return {
		subject: `Welcome to ${platformName}`,
		textBody: `Welcome to ${platformName}`,
		htmlBody: `Welcome to ${htmlLink(linkBase, platformName)}`
	}
}

/** Subscription confirmation with the activation code. */
export function subscriptionMessage(platformName: string, linkBase: string, otp: string): IEmailContent {
	const url = `${linkBase}/x/emailVerify`
	return {
		subject: `Activate your ${platformName} account`,
		textBody: `To confirm your subscription on ${platformName}, open the following link in your browser
     ${url} and enter the following activation code: ${otp}`,
		htmlBody: `<p>To confirm your subscription on ${htmlLink(linkBase, platformName)}, open the following link in your browser
    ${htmlLink(url)} and enter the following activation code: ${escapeHtml(otp)}</p>`
	}
}

/** One-time code mail. */
export function otpMessage(platformName: string, otp: string): IEmailContent {
	return {
		subject: `OTP code for ${platformName}`,
		textBody: `To confirm your subscription on ${platformName}, enter the following OTP code: ${otp}`,
		htmlBody: `<p>To confirm your subscription on ${escapeHtml(platformName)}, enter the following OTP code: ${escapeHtml(otp)}</p>`
	}
}
