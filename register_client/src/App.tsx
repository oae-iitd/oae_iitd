import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type FormData = {
  profilePicture: File | null
  firstName: string
  lastName: string
  email: string
  confirmEmail: string
  username: string
  password: string
  phoneCountryCode: string
  phone: string
  enrollmentNumber: string
  programme: string
  year: string
  course: string
  hostel: string
  hostelAddress: string
  disabilityType: string
  disabilityPercentage: string
  udidNumber: string
  disabilityCertificate: File | null
  idProofType: string
  idProofDocument: File | null
  termsAccepted: boolean
}

type FormErrors = Partial<Record<keyof FormData, string>>

/** Browsers cannot open http://0.0.0.0 — normalize to loopback for local pdf_service. */
function normalizePdfServiceBase(url: string): string {
  const t = url.trim().replace(/\/+$/, '')
  if (!t) return t
  try {
    const u = new URL(t)
    if (u.hostname === '0.0.0.0') {
      u.hostname = '127.0.0.1'
      return u.toString().replace(/\/$/, '')
    }
  } catch {
    /* ignore */
  }
  return t
}

function formatFastApiDetail(detail: unknown): string {
  if (detail == null) return ''
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (e && typeof e === 'object' && 'msg' in e) {
          const msg = (e as { msg?: string }).msg
          if (typeof msg === 'string') return msg
        }
        return JSON.stringify(e)
      })
      .filter(Boolean)
      .join('; ')
  }
  if (typeof detail === 'object') return JSON.stringify(detail)
  return String(detail)
}

function pdfServiceHttpError(res: Response, body: Record<string, unknown>, rawText: string): string {
  const fromDetail = formatFastApiDetail(body.detail)
  if (fromDetail) return fromDetail
  const t = rawText.trim()
  if (t) return `HTTP ${res.status}: ${t.slice(0, 400)}`
  return `HTTP ${res.status} ${res.statusText}`.trim()
}

const initialData: FormData = {
  profilePicture: null,
  firstName: '',
  lastName: '',
  email: '',
  confirmEmail: '',
  username: '',
  password: '',
  phoneCountryCode: '+91',
  phone: '',
  enrollmentNumber: '',
  programme: '',
  year: '',
  course: '',
  hostel: '',
  hostelAddress: '',
  disabilityType: '',
  disabilityPercentage: '',
  udidNumber: '',
  disabilityCertificate: null,
  idProofType: '',
  idProofDocument: null,
  termsAccepted: false,
}

function isImageFile(file: File | null): boolean {
  if (!file) return false
  const mimeLooksImage = file.type.startsWith('image/')
  const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
  const imageExts = ['.jpg', '.jpeg', '.png', '.heif', '.heic', '.webp']
  return mimeLooksImage || imageExts.includes(ext)
}

function isPdfFile(file: File | null): boolean {
  if (!file) return false
  const t = file.type.toLowerCase()
  if (t === 'application/pdf' || t === 'application/x-pdf') return true
  return file.name.toLowerCase().endsWith('.pdf')
}

/** Stable blob URL for file inputs — avoids broken/missing previews from creating new URLs every render. */
function useObjectUrl(file: File | null): string | null {
  const url = useMemo(() => {
    if (!file) return null
    return URL.createObjectURL(file)
  }, [file])

  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [url])

  return url
}

function App() {
  const [formData, setFormData] = useState<FormData>(initialData)
  const [errors, setErrors] = useState<FormErrors>({})
  /** null = not checked or check failed; true = email exists in DB; false = can register */
  const [serverEmailTaken, setServerEmailTaken] = useState<boolean | null>(null)
  const [emailCheckLoading, setEmailCheckLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState(1)
  const [otpValue, setOtpValue] = useState('')
  const [otpSentTo, setOtpSentTo] = useState('')
  const [otpError, setOtpError] = useState('')
  const [otpVerified, setOtpVerified] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeView, setActiveView] = useState<'register' | 'status'>('register')
  const [statusEmail, setStatusEmail] = useState('')
  const [statusLoading, setStatusLoading] = useState(false)
  const [statusError, setStatusError] = useState('')
  const [registrationStatus, setRegistrationStatus] = useState<{ approvalStatus: string; approvalReason: string } | null>(null)
  const [countryCodeSearch, setCountryCodeSearch] = useState('')
  const [showCountryCodeDropdown, setShowCountryCodeDropdown] = useState(false)
  const [pdfScanFile, setPdfScanFile] = useState<File | null>(null)
  const [pdfScanLoading, setPdfScanLoading] = useState(false)
  const [pdfScanError, setPdfScanError] = useState('')
  const [pdfScanResult, setPdfScanResult] = useState<{
    pdf_type?: string
    ud_id?: string | null
    name?: string | null
    disability_type?: string | null
    disability_percentage?: string | null
  } | null>(null)
  const [studentScanFile, setStudentScanFile] = useState<File | null>(null)
  const [studentScanLoading, setStudentScanLoading] = useState(false)
  const [studentScanError, setStudentScanError] = useState('')
  const [studentScanResult, setStudentScanResult] = useState<{
    pdf_type?: string
    entry_no?: string | null
    programme?: string | null
    course?: string | null
    hostel?: string | null
    phone?: string | null
    email?: string | null
  } | null>(null)
  const countryDropdownRef = useRef<HTMLDivElement | null>(null)
  const countryCodes = [
    { code: '+91', country: 'IN', label: '+91 (IN)' },
    { code: '+1', country: 'US/CA', label: '+1 (US/CA)' },
    { code: '+44', country: 'GB', label: '+44 (GB)' },
    { code: '+61', country: 'AU', label: '+61 (AU)' },
    { code: '+49', country: 'DE', label: '+49 (DE)' },
    { code: '+33', country: 'FR', label: '+33 (FR)' },
    { code: '+65', country: 'SG', label: '+65 (SG)' },
    { code: '+81', country: 'JP', label: '+81 (JP)' },
    { code: '+971', country: 'AE', label: '+971 (AE)' },
    { code: '+880', country: 'BD', label: '+880 (BD)' },
    { code: '+977', country: 'NP', label: '+977 (NP)' },
    { code: '+94', country: 'LK', label: '+94 (LK)' },
    { code: '+92', country: 'PK', label: '+92 (PK)' },
    { code: '+86', country: 'CN', label: '+86 (CN)' },
  ]
  const hostels = [
    'Nilgiri',
    'Aravali',
    'Karakoram',
    'Kumaon',
    'Jwalamukhi',
    'Vindhyachal',
    'Satpura',
    'Shivalik',
    'Zanskar',
    'Kailash',
    'Himadri',
    'Udaigiri',
    'Girnar',
    'Not, Day Scholar',
  ]
  const programmes = ['B.Tech', 'M.Tech', 'PhD', 'M.Sc', 'B.Sc', 'MBA', 'M.A', 'B.A', 'Other']
  const years = ['1', '2', '3', '4', '5', '6']
  const disabilityTypes = [
    'Visual Impairment',
    'Hearing Impairment',
    'Locomotor Disability',
    'Intellectual Disability',
    'Mental Illness',
    'Multiple Disabilities',
    'Other',
  ]
  const filteredCountryCodes = countryCodes.filter((item) => {
    const searchLower = countryCodeSearch.toLowerCase()
    return (
      item.code.toLowerCase().includes(searchLower) ||
      item.country.toLowerCase().includes(searchLower) ||
      item.label.toLowerCase().includes(searchLower)
    )
  })
  const selectedCountry =
    countryCodes.find((item) => item.code === formData.phoneCountryCode) ?? countryCodes[0]

  const profilePreviewUrl = useObjectUrl(formData.profilePicture)
  const disabilityCertPreviewUrl = useObjectUrl(formData.disabilityCertificate)
  const idProofPreviewUrl = useObjectUrl(formData.idProofDocument)

  const sanitizeUsername = (username: string): string => {
    if (!username) return ''
    return username
      .toLowerCase()
      .replace(/\./g, '_')
      .replace(/[^a-z0-9_]/g, '')
  }

  const getUsernameFromEmail = (email: string): string => {
    if (!email) return ''
    const emailPart = email.split('@')[0] || ''
    return sanitizeUsername(emailPart)
  }

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node
      if (countryDropdownRef.current && !countryDropdownRef.current.contains(target)) {
        setShowCountryCodeDropdown(false)
        setCountryCodeSearch('')
      }
    }

    if (showCountryCodeDropdown) {
      document.addEventListener('mousedown', handleOutsideClick)
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [showCountryCodeDropdown])

  const onInputChange = (field: keyof FormData, value: string | boolean | File | null) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
    setErrors((prev) => ({ ...prev, [field]: '' }))
  }

  const handleEmailChange = (email: string) => {
    const sanitizedEmail = email.trim()
    const nextUsername = getUsernameFromEmail(sanitizedEmail)
    setFormData((prev) => ({
      ...prev,
      email: sanitizedEmail,
      username: nextUsername,
    }))
    setErrors((prev) => ({ ...prev, email: '', username: '' }))
  }

  const normalizedEmail = formData.email.trim().toLowerCase()
  const normalizedConfirmEmail = formData.confirmEmail.trim().toLowerCase()
  const isEmailFormatValid =
    normalizedEmail.length > 0 &&
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(normalizedEmail)
  const isEmailTaken = serverEmailTaken === true
  const showEmailValidHint =
    isEmailFormatValid && serverEmailTaken === false && !errors.email
  const showConfirmEmailMismatchHint =
    normalizedConfirmEmail.length > 0 &&
    normalizedEmail.length > 0 &&
    normalizedEmail !== normalizedConfirmEmail &&
    !errors.confirmEmail
  const showEmailMatchHint =
    normalizedEmail.length > 0 &&
    normalizedConfirmEmail.length > 0 &&
    normalizedEmail === normalizedConfirmEmail &&
    !errors.confirmEmail
  const getPasswordStrength = (password: string): { label: 'Poor' | 'Weak' | 'Medium' | 'Strong'; score: number } => {
    if (!password) return { label: 'Poor', score: 0 }
    let score = 0
    if (password.length >= 8) score += 1
    if (/[A-Z]/.test(password)) score += 1
    if (/[a-z]/.test(password)) score += 1
    if (/\d/.test(password)) score += 1
    if (/[^A-Za-z0-9]/.test(password)) score += 1
    if (score <= 2) return { label: 'Poor', score }
    if (score === 3) return { label: 'Weak', score }
    if (score === 4) return { label: 'Medium', score }
    return { label: 'Strong', score }
  }
  const passwordStrength = getPasswordStrength(formData.password)
  const passwordChecks = {
    minLength: formData.password.length >= 8,
    lowercase: /[a-z]/.test(formData.password),
    uppercase: /[A-Z]/.test(formData.password),
    number: /\d/.test(formData.password),
    special: /[^A-Za-z0-9]/.test(formData.password),
  }
  const visiblePasswordLevel = formData.password.length === 0 ? '' : passwordStrength.label

  const rawApiBaseUrl = (import.meta.env.VITE_API_URL || '').trim()
  const apiBaseUrl = (rawApiBaseUrl || '').replace(/\/+$/, '')
  const pdfServiceUrl = normalizePdfServiceBase(
    ((import.meta.env.VITE_PDF_SERVICE_URL as string | undefined) || '').trim()
  )
  /** In dev, fetch same-origin paths so Vite proxies to VITE_* backends (avoids CORS / mixed content). */
  const useDevProxy =
    import.meta.env.DEV && (import.meta.env.VITE_DEV_PROXY as string | undefined) !== 'false'
  const isApiUrlConfigured = (() => {
    if (!apiBaseUrl) return false
    try {
      const parsed = new URL(apiBaseUrl)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  })()
  const apiConfigError = isApiUrlConfigured
    ? ''
    : `Invalid VITE_API_URL: "${rawApiBaseUrl || '(empty)'}". Set it to full http(s) URL, e.g. https://api.anyserver.site`

  const buildApiUrl = (path: string): string => {
    if (!isApiUrlConfigured) {
      throw new Error(apiConfigError)
    }
    if (useDevProxy) return path
    return `${apiBaseUrl}${path}`
  }

  const buildPdfUploadUrl = (path: '/extract' | '/extract-student'): string => {
    if (useDevProxy) return `/pdf-service${path}`
    if (pdfServiceUrl) return `${pdfServiceUrl}${path}`
    return `/pdf-service${path}`
  }

  const readJson = async <T,>(response: Response): Promise<T> => {
    return (await response.json().catch(() => ({}))) as T
  }

  useEffect(() => {
    const base = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '')
    if (!base) {
      setServerEmailTaken(null)
      setEmailCheckLoading(false)
      return
    }
    if (!isEmailFormatValid || !normalizedEmail) {
      setServerEmailTaken(null)
      setEmailCheckLoading(false)
      return
    }
    setEmailCheckLoading(true)
    const ac = new AbortController()
    const t = window.setTimeout(() => {
      void (async () => {
        try {
          const path = `/api/register/student/email-available?email=${encodeURIComponent(normalizedEmail)}`
          const url = useDevProxy ? path : `${base}${path}`
          const res = await fetch(url, { signal: ac.signal })
          const data = (await res.json().catch(() => ({}))) as { available?: boolean }
          if (ac.signal.aborted) return
          if (res.ok && typeof data.available === 'boolean') {
            setServerEmailTaken(!data.available)
          } else {
            setServerEmailTaken(null)
          }
        } catch {
          if (!ac.signal.aborted) setServerEmailTaken(null)
        } finally {
          if (!ac.signal.aborted) setEmailCheckLoading(false)
        }
      })()
    }, 450)
    return () => {
      window.clearTimeout(t)
      ac.abort()
    }
  }, [normalizedEmail, isEmailFormatValid, useDevProxy])

  const canProceedStep1 =
    formData.firstName.trim().length > 0 &&
    formData.lastName.trim().length > 0 &&
    isEmailFormatValid &&
    !isEmailTaken &&
    !emailCheckLoading &&
    normalizedEmail === normalizedConfirmEmail &&
    formData.username.trim().length > 0 &&
    formData.password.length >= 8 &&
    /^\d{10}$/.test(formData.phone)

  const getErrorMessage = (error: unknown, fallback: string): string => {
    if (!isApiUrlConfigured) {
      return apiConfigError
    }
    if (error instanceof TypeError) {
      return useDevProxy
        ? `Cannot reach API via dev proxy. Ensure Vite dev server is running and VITE_API_URL is set (proxied to /api).`
        : `Cannot reach API at ${apiBaseUrl}. Check server/CORS/network.`
    }
    if (error instanceof Error) return error.message
    return fallback
  }

  const handleScanPdf = async () => {
    if (!pdfScanFile) {
      setPdfScanError('Please select a PDF file first.')
      return
    }
    setPdfScanLoading(true)
    setPdfScanError('')
    setPdfScanResult(null)
    try {
      const form = new FormData()
      form.append('file', pdfScanFile)
      const res = await fetch(buildPdfUploadUrl('/extract'), { method: 'POST', body: form })
      const rawText = await res.text()
      let body: Record<string, unknown> = {}
      try {
        const p = JSON.parse(rawText) as unknown
        if (p && typeof p === 'object' && p !== null && !Array.isArray(p)) body = p as Record<string, unknown>
      } catch {
        /* non-JSON e.g. proxy 502 HTML */
      }
      if (!res.ok) throw new Error(pdfServiceHttpError(res, body, rawText))
      const data = body as {
        pdf_type?: string
        ud_id?: string | null
        name?: string | null
        disability_type?: string | null
        disability_percentage?: string | null
      }
      setPdfScanResult(data)
      // Auto-fill matched form fields
      if (data.ud_id) onInputChange('udidNumber', data.ud_id)
      if (data.disability_percentage) onInputChange('disabilityPercentage', data.disability_percentage)
      if (data.disability_type) {
        const match = disabilityTypes.find(
          (t) =>
            t.toLowerCase().includes(data.disability_type!.toLowerCase()) ||
            data.disability_type!.toLowerCase().includes(t.toLowerCase())
        )
        if (match) onInputChange('disabilityType', match)
      }
      if (data.name) {
        const parts = data.name.trim().split(/\s+/)
        if (parts.length >= 2) {
          onInputChange('firstName', parts.slice(0, -1).join(' '))
          onInputChange('lastName', parts[parts.length - 1])
        } else if (parts.length === 1) {
          onInputChange('firstName', parts[0])
        }
      }
    } catch (err) {
      setPdfScanError(err instanceof Error ? err.message : 'Failed to scan PDF.')
    } finally {
      setPdfScanLoading(false)
    }
  }

  const handleScanStudentId = async () => {
    if (!studentScanFile) {
      setStudentScanError('Please select a PDF file first.')
      return
    }
    setStudentScanLoading(true)
    setStudentScanError('')
    setStudentScanResult(null)
    try {
      const form = new FormData()
      form.append('file', studentScanFile)
      const res = await fetch(buildPdfUploadUrl('/extract-student'), { method: 'POST', body: form })
      const rawText = await res.text()
      let body: Record<string, unknown> = {}
      try {
        const p = JSON.parse(rawText) as unknown
        if (p && typeof p === 'object' && p !== null && !Array.isArray(p)) body = p as Record<string, unknown>
      } catch {
        /* non-JSON e.g. proxy 502 HTML */
      }
      if (!res.ok) throw new Error(pdfServiceHttpError(res, body, rawText))
      const data = body as {
        pdf_type?: string
        entry_no?: string | null
        programme?: string | null
        course?: string | null
        hostel?: string | null
        phone?: string | null
        email?: string | null
      }
      setStudentScanResult(data)
      const hasAnyStudentField = Boolean(
        data.entry_no ||
          data.programme ||
          data.course ||
          data.hostel ||
          data.phone ||
          data.email
      )
      if (!hasAnyStudentField) {
        setStudentScanError(
          'No student ID fields were detected in this PDF. Try a clearer scan or a text-based PDF. If the problem continues, the ID format may need an update on the server.'
        )
      }
      if (data.entry_no) onInputChange('enrollmentNumber', data.entry_no)
      if (data.programme) onInputChange('programme', data.programme)
      if (data.course) onInputChange('course', data.course)
      if (data.hostel) {
        const matchedHostel = hostels.find(
          (h) => h.toLowerCase() === data.hostel!.toLowerCase()
        )
        if (matchedHostel) onInputChange('hostel', matchedHostel)
      }
      if (data.phone) onInputChange('phone', data.phone)
      if (data.email) handleEmailChange(data.email)
    } catch (err) {
      setStudentScanError(err instanceof Error ? err.message : 'Failed to scan Student ID.')
    } finally {
      setStudentScanLoading(false)
    }
  }

  const validateByStep = (step: number): FormErrors => {
    const nextErrors: FormErrors = {}
    // step 1 = Upload (optional scan — no required validation)
    if (step === 2) {
      if (!formData.firstName.trim()) nextErrors.firstName = 'First name is required.'
      if (!formData.lastName.trim()) nextErrors.lastName = 'Last name is required.'
      if (!formData.email.trim()) nextErrors.email = 'Email is required.'
      else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(formData.email)) {
        nextErrors.email = 'Please enter a valid email address.'
      } else if (isEmailTaken) {
        nextErrors.email = 'This email is already registered.'
      }
      if (!formData.confirmEmail.trim()) nextErrors.confirmEmail = 'Please re-enter your email address.'
      else if (normalizedEmail !== normalizedConfirmEmail) {
        nextErrors.confirmEmail = 'Email addresses do not match. Please check and re-enter.'
      }
      if (!formData.username.trim()) nextErrors.username = 'Username is required.'
      if (!formData.password) nextErrors.password = 'Password is required.'
      else if (formData.password.length < 8) nextErrors.password = 'Password must be at least 8 characters.'
      if (!formData.phoneCountryCode.trim()) nextErrors.phone = 'Country code is required.'
      else if (!/^\d{10}$/.test(formData.phone)) nextErrors.phone = 'Phone must be 10 digits.'
    } else if (step === 3) {
      if (!formData.enrollmentNumber.trim()) nextErrors.enrollmentNumber = 'Entry Number is required.'
      if (!formData.programme.trim()) nextErrors.programme = 'Programme is required.'
      if (!formData.year.trim()) nextErrors.year = 'Year is required.'
      if (!formData.course.trim()) nextErrors.course = 'Course is required.'
      if (formData.hostel === 'Not, Day Scholar') {
        if (!formData.hostelAddress.trim()) nextErrors.hostel = 'Day Scholar Address is required.'
      } else if (!formData.hostel.trim()) {
        nextErrors.hostel = 'Hostel Address/Day Scholar Address is required.'
      }
    } else if (step === 4) {
      if (!formData.profilePicture) nextErrors.profilePicture = 'Profile Picture is required.'
      if (!formData.disabilityType.trim()) nextErrors.disabilityType = 'Disability Type is required.'
      const disabilityPercent = Number(formData.disabilityPercentage)
      if (!formData.disabilityPercentage.trim()) nextErrors.disabilityPercentage = 'Disability Percentage is required.'
      else if (Number.isNaN(disabilityPercent) || disabilityPercent < 0 || disabilityPercent > 100) {
        nextErrors.disabilityPercentage = 'Enter a value between 0 and 100.'
      }
      if (!formData.udidNumber.trim()) nextErrors.udidNumber = 'UDID Number is required.'
      if (!formData.disabilityCertificate) nextErrors.disabilityCertificate = 'Disability Certificate is required.'
      if (!formData.idProofType) nextErrors.idProofType = 'ID Proof Type is required.'
      if (!formData.idProofDocument) nextErrors.idProofDocument = 'ID Proof Document is required.'
    } else if (step === 5) {
      if (!formData.termsAccepted) nextErrors.termsAccepted = 'You must accept terms and conditions.'
    }

    return nextErrors
  }

  const handleNext = () => {
    const validationErrors = validateByStep(currentStep)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }
    setErrors({})
    setCurrentStep((prev) => Math.min(prev + 1, 5))
  }

  const handlePrevious = () => {
    setErrors({})
    setOtpError('')
    setCurrentStep((prev) => Math.max(prev - 1, 1))
  }

  const uploadRegistrationFile = async (
    file: File,
    category: 'profile' | 'certificate' | 'document'
  ): Promise<string> => {
    const form = new FormData()
    form.append('file', file)
    const uploadUrl = buildApiUrl(`/api/register/student/upload?category=${encodeURIComponent(category)}`)
    const res = await fetch(uploadUrl, {
      method: 'POST',
      body: form,
    })
    const data = await readJson<{ url?: string; error?: string }>(res)
    if (!res.ok) {
      throw new Error(data.error || 'Failed to upload file')
    }
    if (!data.url || typeof data.url !== 'string') {
      throw new Error('Upload did not return a file URL')
    }
    return data.url
  }

  const persistRegistration = async () => {
    // Upload binaries first — server stores paths like /api/files/profile/<uuid>.jpg (not just the original filename).
    let profilePicturePath = ''
    let disabilityCertificatePath = ''
    let idProofDocumentPath = ''
    if (formData.profilePicture) {
      profilePicturePath = await uploadRegistrationFile(formData.profilePicture, 'profile')
    }
    if (formData.disabilityCertificate) {
      disabilityCertificatePath = await uploadRegistrationFile(formData.disabilityCertificate, 'certificate')
    }
    if (formData.idProofDocument) {
      idProofDocumentPath = await uploadRegistrationFile(formData.idProofDocument, 'document')
    }

    const payload = {
      email: formData.email,
      username: formData.username,
      password: formData.password,
      name: `${formData.firstName} ${formData.lastName}`,
      phone: `${formData.phoneCountryCode}${formData.phone}`,
      enrollmentNumber: formData.enrollmentNumber,
      programme: formData.programme,
      course: formData.course,
      year: formData.year,
      hostel: formData.hostel === 'Not, Day Scholar' ? formData.hostelAddress : formData.hostel,
      profilePicture: profilePicturePath,
      disabilityType: formData.disabilityType,
      disabilityPercentage: Number(formData.disabilityPercentage || 0),
      udidNumber: formData.udidNumber,
      disabilityCertificate: disabilityCertificatePath,
      idProofType: formData.idProofType,
      idProofDocument: idProofDocumentPath,
    }

    const targetUrl = buildApiUrl('/api/register/student')
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await readJson<{ error?: string }>(response)
    if (!response.ok) {
      throw new Error(data.error || 'Failed to register student')
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setOtpError('')
    const validationErrors = validateByStep(4)
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors)
      return
    }

    setErrors({})
    setIsSubmitting(true)
    try {
      const targetUrl = buildApiUrl('/api/register/student/send-otp')
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.email }),
      })
      const data = await readJson<{ error?: string }>(response)
      if (!response.ok) {
        throw new Error(data.error || 'Failed to send OTP')
      }
      setOtpSentTo(formData.email)
      setOtpValue('')
      setOtpError('')
      setOtpVerified(false)
      setCurrentStep(6)
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to send OTP')
      setOtpError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleVerifyOtp = async () => {
    if (isSubmitting) return
    if (!otpValue.trim()) {
      setOtpError('Please enter OTP.')
      return
    }
    setIsSubmitting(true)
    try {
      const targetUrl = buildApiUrl('/api/register/student/verify-otp')
      const verifyResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpSentTo || formData.email, otp: otpValue }),
      })
      const verifyData = await readJson<{ error?: string }>(verifyResponse)
      if (!verifyResponse.ok) {
        throw new Error(verifyData.error || 'Invalid OTP')
      }
      await persistRegistration()
      setOtpError('')
      setOtpVerified(true)
    } catch (error) {
      const message = getErrorMessage(error, 'Registration failed')
      setOtpError(message)
      setOtpVerified(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResendOtp = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)
    try {
      const targetUrl = buildApiUrl('/api/register/student/send-otp')
      const response = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: otpSentTo || formData.email }),
      })
      const data = await readJson<{ error?: string }>(response)
      if (!response.ok) {
        throw new Error(data.error || 'Failed to resend OTP')
      }
      setOtpValue('')
      setOtpError('')
    } catch (error) {
      const message = getErrorMessage(error, 'Failed to resend OTP')
      setOtpError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const checkRegistrationStatus = async () => {
    const email = statusEmail.trim().toLowerCase()
    if (!email) {
      setStatusError('Please enter email.')
      return
    }
    setStatusError('')
    setStatusLoading(true)
    try {
      const statusPath = `/api/register/student/status?email=${encodeURIComponent(email)}`
      const response = await fetch(buildApiUrl(statusPath))
      const data = await readJson<{ approvalStatus?: string; approvalReason?: string; error?: string }>(response)
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch status')
      }
      setRegistrationStatus({
        approvalStatus: String(data.approvalStatus || 'pending'),
        approvalReason: String(data.approvalReason || ''),
      })
    } catch (error) {
      setRegistrationStatus(null)
      setStatusError(getErrorMessage(error, 'Failed to fetch status'))
    } finally {
      setStatusLoading(false)
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>Student Registration</h1>
        <p className="subtext">Complete the student registration details.</p>
        <div className="view-toggle">
          <button
            type="button"
            className={`secondary-btn ${activeView === 'register' ? 'view-active' : ''}`}
            onClick={() => setActiveView('register')}
          >
            Register
          </button>
          <button
            type="button"
            className={`secondary-btn ${activeView === 'status' ? 'view-active' : ''}`}
            onClick={() => setActiveView('status')}
          >
            Check Status
          </button>
        </div>

        {activeView === 'register' ? (
        <>
        <div className="steps">
          {['Upload', 'Profile', 'Institution', 'Disability & ID', 'Final', 'OTP Verify'].map((label, index) => (
            <div key={label} className={`step ${currentStep >= index + 1 ? 'step-active' : ''}`}>
              {index + 1}. {label}
        </div>
          ))}
        </div>

        <form className="form-grid" onSubmit={handleSubmit} noValidate>
          {currentStep === 1 ? (
            <div className="full-width upload-step">
              <h2>Auto-fill from Documents</h2>
              <p className="review-subtitle">
                Upload your UDID certificate and Student ID card to automatically extract and pre-fill
                the registration form. Both uploads are optional — you can skip and fill everything manually.
              </p>

              <div className="upload-panels">

                {/* ── UDID Certificate ── */}
                <div className="upload-panel">
                  <h3 className="upload-panel-title">UDID / Disability Certificate</h3>
                  <p className="upload-panel-sub">Pre-fills: UD ID, Name, Disability Type, Disability %</p>
                  <div className="pdf-drop-zone">
                    <input
                      id="pdf-scan-input"
                      type="file"
                      accept=".pdf,application/pdf"
                      className="pdf-file-input"
                      onChange={(e) => {
                        setPdfScanFile(e.target.files?.[0] ?? null)
                        setPdfScanResult(null)
                        setPdfScanError('')
                      }}
                    />
                    <label htmlFor="pdf-scan-input" className="pdf-drop-label">
                      {pdfScanFile ? (
                        <span className="pdf-file-chosen">{pdfScanFile.name}</span>
                      ) : (
                        <>
                          <span className="pdf-drop-icon">📄</span>
                          <span className="pdf-drop-text">Click to select PDF</span>
                        </>
                      )}
                    </label>
                  </div>
                  <button
                    type="button"
                    className="submit-btn pdf-scan-btn"
                    onClick={() => void handleScanPdf()}
                    disabled={!pdfScanFile || pdfScanLoading}
                  >
                    {pdfScanLoading ? 'Scanning…' : 'Scan PDF'}
                  </button>
                  {pdfScanError ? <small className="scan-error">{pdfScanError}</small> : null}
                  {pdfScanResult ? (
                    <div className="scan-result">
                      <p className="scan-result-type">
                        Detected: <strong>{pdfScanResult.pdf_type === 'text' ? 'Text-based' : 'Scanned'}</strong>
                      </p>
                      <div className="scan-fields">
                        <div className="scan-field">
                          <span className="scan-field-label">UD ID</span>
                          <span className="scan-field-value">{pdfScanResult.ud_id ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Name</span>
                          <span className="scan-field-value">{pdfScanResult.name ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Disability Type</span>
                          <span className="scan-field-value">{pdfScanResult.disability_type ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Disability %</span>
                          <span className="scan-field-value">
                            {pdfScanResult.disability_percentage != null ? `${pdfScanResult.disability_percentage}%` : <em>not found</em>}
                          </span>
                        </div>
                      </div>
                      <small className="hint scan-hint">Fields pre-filled. Review and edit in later steps.</small>
                    </div>
                  ) : null}
                </div>

                {/* ── Student ID Card ── */}
                <div className="upload-panel">
                  <h3 className="upload-panel-title">Student ID Card</h3>
                  <p className="upload-panel-sub">Pre-fills: Entry No., Programme, Course, Hostel, Phone, Email</p>
                  <div className="pdf-drop-zone">
                    <input
                      id="student-scan-input"
                      type="file"
                      accept=".pdf,application/pdf"
                      className="pdf-file-input"
                      onChange={(e) => {
                        setStudentScanFile(e.target.files?.[0] ?? null)
                        setStudentScanResult(null)
                        setStudentScanError('')
                      }}
                    />
                    <label htmlFor="student-scan-input" className="pdf-drop-label">
                      {studentScanFile ? (
                        <span className="pdf-file-chosen">{studentScanFile.name}</span>
                      ) : (
                        <>
                          <span className="pdf-drop-icon">🪪</span>
                          <span className="pdf-drop-text">Click to select PDF</span>
                        </>
                      )}
                    </label>
                  </div>
                  <button
                    type="button"
                    className="submit-btn pdf-scan-btn"
                    onClick={() => void handleScanStudentId()}
                    disabled={!studentScanFile || studentScanLoading}
                  >
                    {studentScanLoading ? 'Scanning…' : 'Scan PDF'}
                  </button>
                  {studentScanError ? <small className="scan-error">{studentScanError}</small> : null}
                  {studentScanResult ? (
                    <div className="scan-result">
                      <p className="scan-result-type">
                        Detected: <strong>{studentScanResult.pdf_type === 'text' ? 'Text-based' : 'Scanned'}</strong>
                      </p>
                      <div className="scan-fields">
                        <div className="scan-field">
                          <span className="scan-field-label">Entry No.</span>
                          <span className="scan-field-value">{studentScanResult.entry_no ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Programme</span>
                          <span className="scan-field-value">{studentScanResult.programme ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Course</span>
                          <span className="scan-field-value">{studentScanResult.course ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Hostel</span>
                          <span className="scan-field-value">{studentScanResult.hostel ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Phone</span>
                          <span className="scan-field-value">{studentScanResult.phone ?? <em>not found</em>}</span>
                        </div>
                        <div className="scan-field">
                          <span className="scan-field-label">Email</span>
                          <span className="scan-field-value">{studentScanResult.email ?? <em>not found</em>}</span>
                        </div>
                      </div>
                      <small className="hint scan-hint">Fields pre-filled. Review and edit in later steps.</small>
                    </div>
                  ) : null}
                </div>

              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <>
              <label>
                <span>First Name</span>
                <input
                  value={formData.firstName}
                  onChange={(e) => onInputChange('firstName', e.target.value)}
                  placeholder="First name"
                />
                {errors.firstName ? <small>{errors.firstName}</small> : null}
              </label>

          <label>
            <span>Last Name</span>
            <input
              value={formData.lastName}
              onChange={(e) => onInputChange('lastName', e.target.value)}
              placeholder="Last name"
            />
            {errors.lastName ? <small>{errors.lastName}</small> : null}
          </label>

          <label>
            <span>Email</span>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleEmailChange(e.target.value)}
              placeholder="you@example.com"
              className={showEmailValidHint ? 'field-valid' : undefined}
            />
            {errors.email ? <small>{errors.email}</small> : null}
            {showEmailValidHint ? (
              <small className="hint success">This email is available for registration.</small>
            ) : null}
            {!errors.email && isEmailTaken ? (
              <small className="hint error-soft">This email is already registered in the system.</small>
            ) : null}
          </label>

          <label>
            <span>Confirm Email</span>
            <input
              type="email"
              value={formData.confirmEmail}
              onChange={(e) => onInputChange('confirmEmail', e.target.value.trim())}
              placeholder="Re-enter your email"
              className={showEmailMatchHint ? 'field-valid' : showConfirmEmailMismatchHint ? 'field-invalid' : undefined}
            />
            {errors.confirmEmail ? <small>{errors.confirmEmail}</small> : null}
            {showEmailMatchHint ? <small className="hint success">Email addresses match.</small> : null}
            {showConfirmEmailMismatchHint ? (
              <small className="hint error-soft">Email addresses do not match yet.</small>
            ) : null}
          </label>

          <label>
            <span>Username</span>
            <input
              value={formData.username}
              readOnly
              placeholder="Auto generated from email"
            />
            {errors.username ? <small>{errors.username}</small> : null}
            {!errors.username ? <small className="hint">Auto-generated from email (for example: name@example.com to name).</small> : null}
          </label>

          <label>
            <span>Password</span>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => onInputChange('password', e.target.value)}
              placeholder="Minimum 8 characters"
            />
            {errors.password ? <small>{errors.password}</small> : null}
            {visiblePasswordLevel ? (
              <div className="password-strength-wrap">
                <div className={`password-strength strength-${passwordStrength.label.toLowerCase()}`}>
                  <span>Password: {passwordStrength.label}</span>
                </div>
              </div>
            ) : null}
            <div className="password-rules">
              <p>Your password should contain:</p>
              <ul>
                <li className={passwordChecks.minLength ? 'rule-ok' : 'rule-pending'}>
                  At least 8 characters
                </li>
                <li className={passwordChecks.lowercase ? 'rule-ok' : 'rule-pending'}>
                  Lowercase letters
                </li>
                <li className={passwordChecks.uppercase ? 'rule-ok' : 'rule-pending'}>
                  Uppercase letters
                </li>
                <li className={passwordChecks.number ? 'rule-ok' : 'rule-pending'}>
                  Numbers
            </li>
                <li className={passwordChecks.special ? 'rule-ok' : 'rule-pending'}>
                  Special characters
            </li>
          </ul>
        </div>
          </label>

              <label>
                <span>Phone</span>
                <div className="phone-label-row">
                  <span className="phone-format-chip">
                    Format: {formData.phoneCountryCode} XXXXXXXX
                  </span>
                  <span className="phone-length-chip">{formData.phone.length}/10</span>
                </div>
                <div className="phone-input searchable-country">
                  <div className="country-search-wrap" ref={countryDropdownRef}>
                    <button
                      type="button"
                      className="country-trigger"
                      onClick={() => {
                        setShowCountryCodeDropdown(true)
                        setCountryCodeSearch('')
                      }}
                      aria-expanded={showCountryCodeDropdown}
                      aria-haspopup="listbox"
                    >
                      <span className="country-trigger-main">{selectedCountry.code}</span>
                      <span className="country-trigger-sub">{selectedCountry.country}</span>
                    </button>
                    {showCountryCodeDropdown ? (
                      <>
                        <div className="country-dropdown" onClick={(e) => e.stopPropagation()}>
                          <div className="country-search-box" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="text"
                              value={countryCodeSearch}
                              onChange={(e) => setCountryCodeSearch(e.target.value)}
                              placeholder="Search code or country"
                              autoFocus
                            />
                          </div>
                          {filteredCountryCodes.length > 0 ? (
                            filteredCountryCodes.map((item) => (
                              <div
                                key={`${item.code}-${item.country}`}
                                className={`country-option ${formData.phoneCountryCode === item.code ? 'selected' : ''}`}
                                onMouseDown={(e) => {
                                  e.preventDefault()
                                  onInputChange('phoneCountryCode', item.code)
                                  setShowCountryCodeDropdown(false)
                                  setCountryCodeSearch('')
                                }}
                              >
                                {item.label}
                              </div>
                            ))
                          ) : (
                            <div className="country-empty">No country found</div>
                          )}
                        </div>
                      </>
                    ) : null}
                  </div>
                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) => onInputChange('phone', e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="Enter phone number"
                  />
                </div>
                {errors.phone ? <small>{errors.phone}</small> : null}
                {!errors.phone ? <small className="hint">Use only digits, exactly 10 length.</small> : null}
              </label>
            </>
          ) : null}

          {currentStep === 3 ? (
            <>
              <label>
            <span>Entry Number (Enrollment Number)</span>
            <input
              value={formData.enrollmentNumber}
              onChange={(e) => onInputChange('enrollmentNumber', e.target.value)}
              placeholder="e.g. 2024CSB1234"
            />
            {errors.enrollmentNumber ? <small>{errors.enrollmentNumber}</small> : null}
              </label>

              <label>
            <span>Programme</span>
            <select value={formData.programme} onChange={(e) => onInputChange('programme', e.target.value)}>
              <option value="">Select Programme</option>
              {programmes.map((programme) => (
                <option key={programme} value={programme}>
                  {programme}
                </option>
              ))}
            </select>
            {errors.programme ? <small>{errors.programme}</small> : null}
              </label>

              <label>
            <span>Year</span>
            <select value={formData.year} onChange={(e) => onInputChange('year', e.target.value)}>
              <option value="">Select Year</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
            {errors.year ? <small>{errors.year}</small> : null}
              </label>

              <label>
            <span>Course</span>
            <input
              value={formData.course}
              onChange={(e) => onInputChange('course', e.target.value)}
              placeholder="e.g. Computer Science"
            />
            {errors.course ? <small>{errors.course}</small> : null}
              </label>

              <label className="full-width">
            <span>Hostel/Day Scholar Address</span>
            {formData.hostel === 'Not, Day Scholar' ? (
              <>
                <input
                  value={formData.hostelAddress}
                  onChange={(e) => onInputChange('hostelAddress', e.target.value)}
                  placeholder="Enter Day Scholar Address"
                />
                <button
                  type="button"
                  className="secondary-btn"
                  onClick={() => {
                    onInputChange('hostel', '')
                    onInputChange('hostelAddress', '')
                  }}
                >
                  Select Hostel Instead
                </button>
              </>
            ) : (
              <select
                value={formData.hostel}
                onChange={(e) => {
                  const selectedValue = e.target.value
                  onInputChange('hostel', selectedValue)
                  if (selectedValue !== 'Not, Day Scholar') {
                    onInputChange('hostelAddress', '')
                  }
                }}
              >
                <option value="">Select Hostel</option>
                {hostels.map((hostel) => (
                  <option key={hostel} value={hostel}>
                    {hostel}
                  </option>
                ))}
              </select>
            )}
            {errors.hostel ? <small>{errors.hostel}</small> : null}
              </label>
            </>
          ) : null}

          {currentStep === 4 ? (
            <>
              <label className="full-width">
                <span>Profile Picture</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png,.heif,.heic"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null
                    if (!file) {
                      onInputChange('profilePicture', null)
                      return
                    }
                    const ext = `.${file.name.split('.').pop()?.toLowerCase()}`
                    const allowedTypes = ['.jpg', '.jpeg', '.png', '.heif', '.heic']
                    if (!allowedTypes.includes(ext)) {
                      setErrors((prev) => ({
                        ...prev,
                        profilePicture:
                          'Invalid file type. Allowed types: .jpg, .jpeg, .png, .heif, .heic',
                      }))
                      return
                    }
                    onInputChange('profilePicture', file)
                  }}
                />
                {errors.profilePicture ? <small>{errors.profilePicture}</small> : null}
                {formData.profilePicture && profilePreviewUrl ? (
                  <img
                    className="profile-preview"
                    src={profilePreviewUrl}
                    alt="Profile preview"
                  />
                ) : null}
              </label>

              <label>
            <span>Disability Type</span>
            <select value={formData.disabilityType} onChange={(e) => onInputChange('disabilityType', e.target.value)}>
              <option value="">Select Disability Type</option>
              {disabilityTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {errors.disabilityType ? <small>{errors.disabilityType}</small> : null}
              </label>

              <label>
            <span>Disability Percentage</span>
            <input
              type="number"
              min={0}
              max={100}
              value={formData.disabilityPercentage}
              onChange={(e) => onInputChange('disabilityPercentage', e.target.value)}
              placeholder="0-100"
            />
            {errors.disabilityPercentage ? <small>{errors.disabilityPercentage}</small> : null}
              </label>

              <label>
            <span>UDID Number</span>
            <input
              value={formData.udidNumber}
              onChange={(e) => onInputChange('udidNumber', e.target.value)}
              placeholder="Enter UDID number"
            />
            {errors.udidNumber ? <small>{errors.udidNumber}</small> : null}
              </label>

              <label className="full-width">
            <span>Disability Certificate</span>
            <input
              type="file"
              onChange={(e) => onInputChange('disabilityCertificate', e.target.files?.[0] ?? null)}
              accept=".jpg,.jpeg,.png,.pdf"
            />
            {errors.disabilityCertificate ? <small>{errors.disabilityCertificate}</small> : null}
            {formData.disabilityCertificate && disabilityCertPreviewUrl ? (
              isImageFile(formData.disabilityCertificate) ? (
                <img
                  className="doc-preview-thumb"
                  src={disabilityCertPreviewUrl}
                  alt="Disability certificate preview"
                />
              ) : isPdfFile(formData.disabilityCertificate) ? (
                <iframe
                  title="Disability certificate PDF preview"
                  className="doc-preview-pdf"
                  src={disabilityCertPreviewUrl}
                />
              ) : (
                <span className="file-name-chip">{formData.disabilityCertificate.name}</span>
              )
            ) : null}
              </label>

              <label>
            <span>ID Proof Type</span>
            <select value={formData.idProofType} onChange={(e) => onInputChange('idProofType', e.target.value)}>
              <option value="">Select proof type</option>
              <option value="aadhaar">Aadhaar Card</option>
              <option value="pan">PAN Card</option>
              <option value="voter">Voter Card</option>
            </select>
            {errors.idProofType ? <small>{errors.idProofType}</small> : null}
              </label>

              <label className="full-width">
            <span>ID Proof Document</span>
            <input
              type="file"
              onChange={(e) => onInputChange('idProofDocument', e.target.files?.[0] ?? null)}
              accept=".jpg,.jpeg,.png,.pdf"
            />
            {errors.idProofDocument ? <small>{errors.idProofDocument}</small> : null}
            {formData.idProofDocument && idProofPreviewUrl ? (
              isImageFile(formData.idProofDocument) ? (
                <img
                  className="doc-preview-thumb"
                  src={idProofPreviewUrl}
                  alt="ID proof preview"
                />
              ) : isPdfFile(formData.idProofDocument) ? (
                <iframe
                  title="ID proof PDF preview"
                  className="doc-preview-pdf"
                  src={idProofPreviewUrl}
                />
              ) : (
                <span className="file-name-chip">{formData.idProofDocument.name}</span>
              )
            ) : null}
              </label>
            </>
          ) : null}

          {currentStep === 5 ? (
            <>
              <div className="full-width review-box">
                <h2>Review Your Details</h2>
                <p className="review-subtitle">Please verify your information before final submit.</p>
                <div className="review-grid">
                  <div className="review-item">
                    <span className="review-label">Name</span>
                    <span className="review-value">{formData.firstName} {formData.lastName}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Email</span>
                    <span className="review-value">{formData.email}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Phone</span>
                    <span className="review-value">{formData.phoneCountryCode} {formData.phone}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Entry Number</span>
                    <span className="review-value">{formData.enrollmentNumber}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Programme / Year</span>
                    <span className="review-value">{formData.programme} / {formData.year}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Course</span>
                    <span className="review-value">{formData.course || '-'}</span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">Disability</span>
                    <span className="review-value">
                      {formData.disabilityType
                        ? `${formData.disabilityType} (${formData.disabilityPercentage || '0'}%)`
                        : '-'}
                    </span>
                  </div>
                  <div className="review-item">
                    <span className="review-label">UDID Number</span>
                    <span className="review-value">{formData.udidNumber || '-'}</span>
                  </div>
                  <div className="review-item review-item-full">
                    <span className="review-label">ID Proof</span>
                    <span className="review-value">
                      {formData.idProofType ? formData.idProofType.toUpperCase() : '-'}
                    </span>
                    {formData.idProofDocument && idProofPreviewUrl ? (
                      isImageFile(formData.idProofDocument) ? (
                        <img
                          className="review-doc-preview"
                          src={idProofPreviewUrl}
                          alt="ID proof preview"
                        />
                      ) : isPdfFile(formData.idProofDocument) ? (
                        <iframe
                          title="ID proof PDF"
                          className="review-doc-pdf"
                          src={idProofPreviewUrl}
                        />
                      ) : (
                        <span className="review-file-chip">{formData.idProofDocument.name}</span>
                      )
                    ) : null}
                  </div>
                  <div className="review-item review-item-full">
                    <span className="review-label">Disability Certificate</span>
                    {formData.disabilityCertificate && disabilityCertPreviewUrl ? (
                      isImageFile(formData.disabilityCertificate) ? (
                        <img
                          className="review-doc-preview"
                          src={disabilityCertPreviewUrl}
                          alt="Disability certificate preview"
                        />
                      ) : isPdfFile(formData.disabilityCertificate) ? (
                        <iframe
                          title="Disability certificate PDF"
                          className="review-doc-pdf"
                          src={disabilityCertPreviewUrl}
                        />
                      ) : (
                        <span className="review-file-chip">{formData.disabilityCertificate.name}</span>
                      )
                    ) : (
                      <span className="review-value">-</span>
                    )}
                  </div>
                  <div className="review-item review-item-full">
                    <span className="review-label">Profile Picture</span>
                    {formData.profilePicture && profilePreviewUrl ? (
                      <img
                        className="review-profile-preview"
                        src={profilePreviewUrl}
                        alt="Profile preview"
                      />
                    ) : (
                      <span className="review-value">-</span>
                    )}
                  </div>
                </div>
              </div>

              <label className="checkbox-row full-width">
            <input
              type="checkbox"
              checked={formData.termsAccepted}
              onChange={(e) => onInputChange('termsAccepted', e.target.checked)}
            />
            <span>I agree to the terms and conditions</span>
              </label>
              {errors.termsAccepted ? <small className="full-width">{errors.termsAccepted}</small> : null}
              {otpError ? <small className="full-width">{otpError}</small> : null}
            </>
          ) : null}

          {currentStep === 6 ? (
            <>
              <div className="full-width review-box otp-box">
                <h2>Email OTP Verification</h2>
                <p className="review-subtitle">
                  Enter the 6-digit OTP sent to <strong>{otpSentTo || formData.email}</strong>.
                </p>
                <label className="full-width">
                  <span>OTP</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={otpValue}
                    onChange={(e) => setOtpValue(e.target.value.replace(/\D/g, ''))}
                    placeholder="Enter 6-digit OTP"
                  />
                  {otpError ? <small>{otpError}</small> : null}
                  {otpVerified ? <small className="hint success">OTP verified. Registration complete.</small> : null}
                </label>
                <div className="otp-actions">
                  <button type="button" className="secondary-btn" onClick={handleResendOtp}>
                    Resend OTP
                  </button>
                  <button type="button" className="submit-btn" onClick={handleVerifyOtp} disabled={otpVerified || isSubmitting}>
                    {otpVerified ? 'Verified' : isSubmitting ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {currentStep < 6 ? (
          <div className="full-width nav-row">
            <div>{currentStep > 1 ? <button type="button" className="secondary-btn" onClick={handlePrevious}>Previous</button> : null}</div>
            <div>
              {currentStep < 5 ? (
                <button className="submit-btn" type="button" onClick={handleNext} disabled={currentStep === 2 && !canProceedStep1}>
                  Next
                </button>
              ) : (
                <button className="submit-btn" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Sending OTP...' : 'Register Student'}
                </button>
              )}
            </div>
          </div>
          ) : null}
        </form>
        </>
        ) : (
          <div className="status-card">
            <h2>Registration Status</h2>
            <p className="review-subtitle">Enter your registration email to check admin review status.</p>
            <div className="status-form">
              <input
                type="email"
                value={statusEmail}
                onChange={(e) => setStatusEmail(e.target.value)}
                placeholder="you@example.com"
              />
              <button type="button" className="submit-btn" onClick={checkRegistrationStatus} disabled={statusLoading}>
                {statusLoading ? 'Checking...' : 'Check'}
              </button>
            </div>
            {statusError ? <small>{statusError}</small> : null}
            {registrationStatus ? (
              <div className="status-result">
                <p>
                  <strong>Status:</strong>{' '}
                  <span className={`status-pill status-${registrationStatus.approvalStatus.toLowerCase()}`}>
                    {registrationStatus.approvalStatus}
                  </span>
                </p>
                {registrationStatus.approvalReason ? (
                  <p><strong>Reason:</strong> {registrationStatus.approvalReason}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        )}

      </section>
    </main>
  )
}

export default App
