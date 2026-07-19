/**
 * Branding, identity & attribution.
 *
 * Single source of truth for the SoyRage Agency identity carried by the
 * toolkit: the ASCII banner, product metadata and report footers.
 *
 * Part of V2P — VMware to Proxmox Migration Toolkit.
 * Crafted by SoyRage Agency — https://soyrage.es/
 * Licensed under the SoyRage Attribution License (see LICENSE).
 */

/** Immutable identity of the project's author. Do not fork without credit. */
export const BRAND = Object.freeze({
  product: "V2P — VMware to Proxmox Migration Toolkit",
  short: "V2P",
  author: "SoyRage Agency",
  url: "https://soyrage.es/",
  donate: "https://www.paypal.com/paypalme/soyrageagency",
  repo: "https://github.com/soyrageagency/vmware-to-proxmox",
  tagline: "Escape vSphere. Land on Proxmox — with a plan.",
  version: "1.0.0",
  accent: "#2f97ee",
});

/** ASCII welcome banner (ANSI Shadow style). */
export const ASCII_BANNER = String.raw`
 ██╗   ██╗██████╗ ██████╗
 ██║   ██║╚════██╗██╔══██╗    VMware  →  Proxmox
 ██║   ██║ █████╔╝██████╔╝    Migration Toolkit
 ╚██╗ ██╔╝██╔═══╝ ██╔═══╝
  ╚████╔╝ ███████╗██║        by SoyRage Agency
   ╚═══╝  ╚══════╝╚═╝        https://soyrage.es/
`;
