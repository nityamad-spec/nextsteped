import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  studentName?: string
  courseName?: string
  courseCode?: string
  enrollmentCode?: string
  professorName?: string
}

const SIGNUP_URL = 'https://app.nextsteped.com'

const Email = ({
  studentName,
  courseName = 'your course',
  courseCode,
  enrollmentCode = '',
  professorName,
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>{`You're invited to join ${courseName} on NextStep`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>NextStep</Text>
        <Heading style={heading}>You&apos;re invited to join {courseName}</Heading>
        <Text style={text}>
          {studentName ? `Hi ${studentName},` : 'Hi there,'}
        </Text>
        <Text style={text}>
          {professorName ? `${professorName} has ` : 'Your instructor has '}
          added you to <strong>{courseName}</strong>
          {courseCode ? ` (${courseCode})` : ''} on NextStep. Use the enrollment
          code below to set up your account.
        </Text>

        <Section style={codeBox}>
          <Text style={codeLabel}>Enrollment code</Text>
          <Text style={codeValue}>{enrollmentCode}</Text>
        </Section>

        <Text style={stepsHeading}>How to get started</Text>
        <Text style={step}>1. Open the NextStep signup page below.</Text>
        <Text style={step}>2. Choose <strong>I&apos;m New Here</strong> as a student.</Text>
        <Text style={step}>3. Enter your details, then the enrollment code above.</Text>
        <Text style={step}>4. Verify your email address.</Text>
        <Text style={step}>5. Set your password.</Text>
        <Text style={step}>6. Take the short diagnostic so your course adapts to you.</Text>

        <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
          <Button style={button} href={SIGNUP_URL}>
            Get started
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={footer}>
          If you weren&apos;t expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `You're invited to join ${data?.courseName || 'your course'} on NextStep`,
  displayName: 'Course invitation',
  previewData: {
    studentName: 'Jordan Lee',
    courseName: 'Introduction to Generative AI',
    courseCode: 'GEN-AI-101',
    enrollmentCode: 'A7F3K2',
    professorName: 'Dr. Rivera',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
}
const container = { padding: '28px 24px', maxWidth: '560px', margin: '0 auto' }
const brand = {
  fontSize: '13px',
  letterSpacing: '1.5px',
  textTransform: 'uppercase' as const,
  color: '#3944b8',
  fontWeight: 700,
  margin: '0 0 12px',
}
const heading = {
  fontSize: '24px',
  lineHeight: '1.3',
  color: '#14161f',
  margin: '0 0 16px',
}
const text = { fontSize: '15px', lineHeight: '1.6', color: '#3d4152' }
const stepsHeading = {
  fontSize: '15px',
  fontWeight: 700,
  color: '#14161f',
  margin: '24px 0 8px',
}
const step = { fontSize: '15px', lineHeight: '1.5', color: '#3d4152', margin: '0 0 6px' }
const codeBox = {
  backgroundColor: '#f3f4fb',
  border: '1px solid #dcdff5',
  borderRadius: '10px',
  padding: '16px',
  textAlign: 'center' as const,
  margin: '24px 0',
}
const codeLabel = {
  fontSize: '12px',
  textTransform: 'uppercase' as const,
  letterSpacing: '1px',
  color: '#6b7086',
  margin: '0 0 6px',
}
const codeValue = {
  fontSize: '30px',
  fontWeight: 700,
  letterSpacing: '4px',
  color: '#3944b8',
  margin: 0,
  fontFamily: 'monospace',
}
const button = {
  backgroundColor: '#3944b8',
  color: '#ffffff',
  borderRadius: '8px',
  padding: '12px 26px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
}
const hr = { borderColor: '#e6e7ef', margin: '28px 0 16px' }
const footer = { fontSize: '12px', color: '#8a8fa3', lineHeight: '1.5' }
