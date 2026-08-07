import type * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  to?: string
}

import { template as courseInvite } from './course-invite.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'course-invite': courseInvite,
}
