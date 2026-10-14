import logoUrlImport from '@brand/logo.svg?url';
import markUrlImport from '@brand/mark.svg?url';

export {
  brand,
  brandDefaultTheme,
  brandName,
  brandShortName,
  brandSlug,
  nativeHostName,
  type RuntimeBrand,
} from './brand-config';

export const logoUrl = logoUrlImport;
export const markUrl = markUrlImport;

const partner = import.meta.env.PARTNER_LOGO_URL ?? '';
export const partnerLogoUrl: string | undefined = partner || undefined;
