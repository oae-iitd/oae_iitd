import React, { useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import "../RideBill/RideBill.css";
import AuthenticatedProfileImage from "../../../components/admin/AuthenticatedProfileImage";
import { filesService } from "../../../services/files/files.service";
import { useToast } from "../../../components/common";
import { useAuth } from "../../../hooks/auth/useAuth";
import type { User, CreateUserDto, UpdateUserDto } from "../../../services/user/user.service";

function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateFromYmd(ymd: string): Date | null {
  const parts = ymd.split("-").map((n) => parseInt(n, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
  const [y, mo, da] = parts;
  return new Date(y, mo - 1, da, 12, 0, 0, 0);
}

const IITD_HOSTELS = [
  "Nilgiri",
  "Aravali",
  "Karakoram",
  "Kumaon",
  "Jwalamukhi",
  "Vindhyachal",
  "Satpura",
  "Shivalik",
  "Zanskar",
  "Kailash",
  "Himadri",
  "Udaigiri",
  "Girnar",
  "Not, Day Scholar",
] as const;

export interface UserModalProps {
  user: User | null;
  onClose: () => void;
  onSave: (data: CreateUserDto | UpdateUserDto) => void;
}

export const UserModal: React.FC<UserModalProps> = ({ user, onClose, onSave }) => {
  const { showError } = useToast();
  const { user: currentUser } = useAuth();

  const lockSuperAdminFields = Boolean(user?.role?.toLowerCase() === "superadmin");

  const canSetSuperAdminRole =
    currentUser?.role?.toLowerCase() === "superadmin";

  const generatePassword = (): string => {
    const length = 12;
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let password = "";
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
  };

  const sanitizeIdentifier = (s: string): string =>
    s ? s.replace(/[^A-Za-z0-9._%+-]/g, "") : "";

  const getUsernameFromEmail = (email: string): string => {
    if (!email) return "";
    const atIndex = email.indexOf("@");
    if (atIndex <= 0) return "";
    return sanitizeIdentifier(email.substring(0, atIndex));
  };

  const getDomainFromEmail = (email: string): string => {
    if (!email) return "";
    const atIndex = email.indexOf("@");
    return atIndex > 0 ? email.substring(atIndex + 1) : "";
  };

  const emailDomains = [
    { value: "gmail.com", label: "gmail.com" },
    { value: "yahoo.com", label: "yahoo.com" },
    { value: "iitd.ac.in", label: "iitd.ac.in" },
    { value: "admin.iitd.ac.in", label: "admin.iitd.ac.in" },
    { value: "custom", label: "Custom (enter full gmail)" },
  ];

  const existingEmail = user?.email || "";
  const existingEmailUsername = existingEmail ? getUsernameFromEmail(existingEmail) : "";
  const existingEmailDomain = existingEmail ? getDomainFromEmail(existingEmail) : "";
  const domainInList = emailDomains.some(d => d.value === existingEmailDomain);
  const initialEmailDomain = existingEmailDomain && domainInList ? existingEmailDomain : (existingEmailDomain ? "custom" : "iitd.ac.in");

  const getPhoneParts = (phone: string | undefined) => {
    if (!phone) return { countryCode: "+91", number: "" };
    const countryCodeMatch = phone.match(/^(\+\d{1,3})\s*(.+)$/);
    if (countryCodeMatch) {
      return { countryCode: countryCodeMatch[1], number: countryCodeMatch[2] };
    }
    if (phone.startsWith("+")) {
      const match = phone.match(/^(\+\d{1,3})(.+)$/);
      if (match) {
        return { countryCode: match[1], number: match[2] };
      }
    }
    return { countryCode: "+91", number: phone };
  };

  const existingPhoneParts = getPhoneParts(user?.phone);

  const getHostelData = () => {
    if (!user?.hostel) return { hostel: "", hostelAddress: "" };
    const known = IITD_HOSTELS as readonly string[];
    if (known.includes(user.hostel)) {
      return { hostel: user.hostel, hostelAddress: "" };
    }
    return { hostel: "Not, Day Scholar", hostelAddress: user.hostel };
  };

  const hostelData = getHostelData();
  
  const [formData, setFormData] = useState({
    email: user?.email || "",
    emailUsername: existingEmailUsername,
    emailDomain: initialEmailDomain,
    username: user?.username || existingEmailUsername,
    password: user ? "" : generatePassword(), // Auto-generate password for new users
    role: user?.role || "", // Start with empty role for new users
    status: user?.status || "active",
    name: user?.name || "",
    phoneCountryCode: existingPhoneParts.countryCode,
    phone: existingPhoneParts.number,
    enrollmentNumber: user?.enrollmentNumber || "",
    programme: user?.programme || "",
    year: user?.year || "",
    course: user?.course || "",
    expiryDate: user?.expiryDate ? user.expiryDate.split('T')[0] : "",
    hostel: hostelData.hostel,
    hostelAddress: hostelData.hostelAddress,
    profilePicture: user?.profilePicture || "",
    disabilityType: user?.disabilityType || "",
    disabilityPercentage: user?.disabilityPercentage?.toString() || "",
    udidNumber: user?.udidNumber || "",
    disabilityCertificate: user?.disabilityCertificate || "",
    idProofType: user?.idProofType || "",
    idProofDocument: user?.idProofDocument || "",
    agreeToTerms: false, // Checkbox for section 4
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showStudentFields, setShowStudentFields] = useState(
    user?.role === "Student" || !user
  );
  const [showDriverFields, setShowDriverFields] = useState(
    user?.role === "Driver" || false
  );
  const [countryCodeSearch, setCountryCodeSearch] = useState("");
  const [showCountryCodeDropdown, setShowCountryCodeDropdown] = useState(false);

  // Multi-step form state
  const [currentStep, setCurrentStep] = useState(user ? 1 : 0); // 0: Role, 1: Profile, 2: Institution/Driver ID Proof, 3: Disability, 4: Submit

  // Country codes list for searchable dropdown
  const countryCodes = [
    { code: "+91", country: "IN", label: "+91 (IN)" },
    { code: "+1", country: "US/CA", label: "+1 (US/CA)" },
    { code: "+7", country: "RU/KZ", label: "+7 (RU/KZ)" },
    { code: "+20", country: "EG", label: "+20 (EG)" },
    { code: "+27", country: "ZA", label: "+27 (ZA)" },
    { code: "+30", country: "GR", label: "+30 (GR)" },
    { code: "+31", country: "NL", label: "+31 (NL)" },
    { code: "+32", country: "BE", label: "+32 (BE)" },
    { code: "+33", country: "FR", label: "+33 (FR)" },
    { code: "+34", country: "ES", label: "+34 (ES)" },
    { code: "+36", country: "HU", label: "+36 (HU)" },
    { code: "+39", country: "IT", label: "+39 (IT)" },
    { code: "+40", country: "RO", label: "+40 (RO)" },
    { code: "+41", country: "CH", label: "+41 (CH)" },
    { code: "+43", country: "AT", label: "+43 (AT)" },
    { code: "+44", country: "GB", label: "+44 (GB)" },
    { code: "+45", country: "DK", label: "+45 (DK)" },
    { code: "+46", country: "SE", label: "+46 (SE)" },
    { code: "+47", country: "NO", label: "+47 (NO)" },
    { code: "+48", country: "PL", label: "+48 (PL)" },
    { code: "+49", country: "DE", label: "+49 (DE)" },
    { code: "+51", country: "PE", label: "+51 (PE)" },
    { code: "+52", country: "MX", label: "+52 (MX)" },
    { code: "+53", country: "CU", label: "+53 (CU)" },
    { code: "+54", country: "AR", label: "+54 (AR)" },
    { code: "+55", country: "BR", label: "+55 (BR)" },
    { code: "+56", country: "CL", label: "+56 (CL)" },
    { code: "+57", country: "CO", label: "+57 (CO)" },
    { code: "+58", country: "VE", label: "+58 (VE)" },
    { code: "+60", country: "MY", label: "+60 (MY)" },
    { code: "+61", country: "AU", label: "+61 (AU)" },
    { code: "+62", country: "ID", label: "+62 (ID)" },
    { code: "+63", country: "PH", label: "+63 (PH)" },
    { code: "+64", country: "NZ", label: "+64 (NZ)" },
    { code: "+65", country: "SG", label: "+65 (SG)" },
    { code: "+66", country: "TH", label: "+66 (TH)" },
    { code: "+81", country: "JP", label: "+81 (JP)" },
    { code: "+82", country: "KR", label: "+82 (KR)" },
    { code: "+84", country: "VN", label: "+84 (VN)" },
    { code: "+86", country: "CN", label: "+86 (CN)" },
    { code: "+90", country: "TR", label: "+90 (TR)" },
    { code: "+92", country: "PK", label: "+92 (PK)" },
    { code: "+93", country: "AF", label: "+93 (AF)" },
    { code: "+94", country: "LK", label: "+94 (LK)" },
    { code: "+95", country: "MM", label: "+95 (MM)" },
    { code: "+98", country: "IR", label: "+98 (IR)" },
    { code: "+212", country: "MA", label: "+212 (MA)" },
    { code: "+213", country: "DZ", label: "+213 (DZ)" },
    { code: "+216", country: "TN", label: "+216 (TN)" },
    { code: "+218", country: "LY", label: "+218 (LY)" },
    { code: "+220", country: "GM", label: "+220 (GM)" },
    { code: "+221", country: "SN", label: "+221 (SN)" },
    { code: "+222", country: "MR", label: "+222 (MR)" },
    { code: "+223", country: "ML", label: "+223 (ML)" },
    { code: "+224", country: "GN", label: "+224 (GN)" },
    { code: "+225", country: "CI", label: "+225 (CI)" },
    { code: "+226", country: "BF", label: "+226 (BF)" },
    { code: "+227", country: "NE", label: "+227 (NE)" },
    { code: "+228", country: "TG", label: "+228 (TG)" },
    { code: "+229", country: "BJ", label: "+229 (BJ)" },
    { code: "+230", country: "MU", label: "+230 (MU)" },
    { code: "+231", country: "LR", label: "+231 (LR)" },
    { code: "+232", country: "SL", label: "+232 (SL)" },
    { code: "+233", country: "GH", label: "+233 (GH)" },
    { code: "+234", country: "NG", label: "+234 (NG)" },
    { code: "+235", country: "TD", label: "+235 (TD)" },
    { code: "+236", country: "CF", label: "+236 (CF)" },
    { code: "+237", country: "CM", label: "+237 (CM)" },
    { code: "+238", country: "CV", label: "+238 (CV)" },
    { code: "+239", country: "ST", label: "+239 (ST)" },
    { code: "+240", country: "GQ", label: "+240 (GQ)" },
    { code: "+241", country: "GA", label: "+241 (GA)" },
    { code: "+242", country: "CG", label: "+242 (CG)" },
    { code: "+243", country: "CD", label: "+243 (CD)" },
    { code: "+244", country: "AO", label: "+244 (AO)" },
    { code: "+245", country: "GW", label: "+245 (GW)" },
    { code: "+246", country: "IO", label: "+246 (IO)" },
    { code: "+248", country: "SC", label: "+248 (SC)" },
    { code: "+249", country: "SD", label: "+249 (SD)" },
    { code: "+250", country: "RW", label: "+250 (RW)" },
    { code: "+251", country: "ET", label: "+251 (ET)" },
    { code: "+252", country: "SO", label: "+252 (SO)" },
    { code: "+253", country: "DJ", label: "+253 (DJ)" },
    { code: "+254", country: "KE", label: "+254 (KE)" },
    { code: "+255", country: "TZ", label: "+255 (TZ)" },
    { code: "+256", country: "UG", label: "+256 (UG)" },
    { code: "+257", country: "BI", label: "+257 (BI)" },
    { code: "+258", country: "MZ", label: "+258 (MZ)" },
    { code: "+260", country: "ZM", label: "+260 (ZM)" },
    { code: "+261", country: "MG", label: "+261 (MG)" },
    { code: "+262", country: "RE", label: "+262 (RE)" },
    { code: "+263", country: "ZW", label: "+263 (ZW)" },
    { code: "+264", country: "NA", label: "+264 (NA)" },
    { code: "+265", country: "MW", label: "+265 (MW)" },
    { code: "+266", country: "LS", label: "+266 (LS)" },
    { code: "+267", country: "BW", label: "+267 (BW)" },
    { code: "+268", country: "SZ", label: "+268 (SZ)" },
    { code: "+269", country: "KM", label: "+269 (KM)" },
    { code: "+290", country: "SH", label: "+290 (SH)" },
    { code: "+291", country: "ER", label: "+291 (ER)" },
    { code: "+297", country: "AW", label: "+297 (AW)" },
    { code: "+298", country: "FO", label: "+298 (FO)" },
    { code: "+299", country: "GL", label: "+299 (GL)" },
    { code: "+350", country: "GI", label: "+350 (GI)" },
    { code: "+351", country: "PT", label: "+351 (PT)" },
    { code: "+352", country: "LU", label: "+352 (LU)" },
    { code: "+353", country: "IE", label: "+353 (IE)" },
    { code: "+354", country: "IS", label: "+354 (IS)" },
    { code: "+355", country: "AL", label: "+355 (AL)" },
    { code: "+356", country: "MT", label: "+356 (MT)" },
    { code: "+357", country: "CY", label: "+357 (CY)" },
    { code: "+358", country: "FI", label: "+358 (FI)" },
    { code: "+359", country: "BG", label: "+359 (BG)" },
    { code: "+370", country: "LT", label: "+370 (LT)" },
    { code: "+371", country: "LV", label: "+371 (LV)" },
    { code: "+372", country: "EE", label: "+372 (EE)" },
    { code: "+373", country: "MD", label: "+373 (MD)" },
    { code: "+374", country: "AM", label: "+374 (AM)" },
    { code: "+375", country: "BY", label: "+375 (BY)" },
    { code: "+376", country: "AD", label: "+376 (AD)" },
    { code: "+377", country: "MC", label: "+377 (MC)" },
    { code: "+378", country: "SM", label: "+378 (SM)" },
    { code: "+380", country: "UA", label: "+380 (UA)" },
    { code: "+381", country: "RS", label: "+381 (RS)" },
    { code: "+382", country: "ME", label: "+382 (ME)" },
    { code: "+383", country: "XK", label: "+383 (XK)" },
    { code: "+385", country: "HR", label: "+385 (HR)" },
    { code: "+386", country: "SI", label: "+386 (SI)" },
    { code: "+387", country: "BA", label: "+387 (BA)" },
    { code: "+389", country: "MK", label: "+389 (MK)" },
    { code: "+420", country: "CZ", label: "+420 (CZ)" },
    { code: "+421", country: "SK", label: "+421 (SK)" },
    { code: "+423", country: "LI", label: "+423 (LI)" },
    { code: "+500", country: "FK", label: "+500 (FK)" },
    { code: "+501", country: "BZ", label: "+501 (BZ)" },
    { code: "+502", country: "GT", label: "+502 (GT)" },
    { code: "+503", country: "SV", label: "+503 (SV)" },
    { code: "+504", country: "HN", label: "+504 (HN)" },
    { code: "+505", country: "NI", label: "+505 (NI)" },
    { code: "+506", country: "CR", label: "+506 (CR)" },
    { code: "+507", country: "PA", label: "+507 (PA)" },
    { code: "+508", country: "PM", label: "+508 (PM)" },
    { code: "+509", country: "HT", label: "+509 (HT)" },
    { code: "+590", country: "BL", label: "+590 (BL)" },
    { code: "+591", country: "BO", label: "+591 (BO)" },
    { code: "+592", country: "GY", label: "+592 (GY)" },
    { code: "+593", country: "EC", label: "+593 (EC)" },
    { code: "+594", country: "GF", label: "+594 (GF)" },
    { code: "+595", country: "PY", label: "+595 (PY)" },
    { code: "+596", country: "MQ", label: "+596 (MQ)" },
    { code: "+597", country: "SR", label: "+597 (SR)" },
    { code: "+598", country: "UY", label: "+598 (UY)" },
    { code: "+599", country: "CW", label: "+599 (CW)" },
    { code: "+670", country: "TL", label: "+670 (TL)" },
    { code: "+672", country: "NF", label: "+672 (NF)" },
    { code: "+673", country: "BN", label: "+673 (BN)" },
    { code: "+674", country: "NR", label: "+674 (NR)" },
    { code: "+675", country: "PG", label: "+675 (PG)" },
    { code: "+676", country: "TO", label: "+676 (TO)" },
    { code: "+677", country: "SB", label: "+677 (SB)" },
    { code: "+678", country: "VU", label: "+678 (VU)" },
    { code: "+679", country: "FJ", label: "+679 (FJ)" },
    { code: "+680", country: "PW", label: "+680 (PW)" },
    { code: "+681", country: "WF", label: "+681 (WF)" },
    { code: "+682", country: "CK", label: "+682 (CK)" },
    { code: "+683", country: "NU", label: "+683 (NU)" },
    { code: "+685", country: "WS", label: "+685 (WS)" },
    { code: "+686", country: "KI", label: "+686 (KI)" },
    { code: "+687", country: "NC", label: "+687 (NC)" },
    { code: "+688", country: "TV", label: "+688 (TV)" },
    { code: "+689", country: "PF", label: "+689 (PF)" },
    { code: "+690", country: "TK", label: "+690 (TK)" },
    { code: "+691", country: "FM", label: "+691 (FM)" },
    { code: "+692", country: "MH", label: "+692 (MH)" },
    { code: "+850", country: "KP", label: "+850 (KP)" },
    { code: "+852", country: "HK", label: "+852 (HK)" },
    { code: "+853", country: "MO", label: "+853 (MO)" },
    { code: "+855", country: "KH", label: "+855 (KH)" },
    { code: "+856", country: "LA", label: "+856 (LA)" },
    { code: "+880", country: "BD", label: "+880 (BD)" },
    { code: "+886", country: "TW", label: "+886 (TW)" },
    { code: "+960", country: "MV", label: "+960 (MV)" },
    { code: "+961", country: "LB", label: "+961 (LB)" },
    { code: "+962", country: "JO", label: "+962 (JO)" },
    { code: "+963", country: "SY", label: "+963 (SY)" },
    { code: "+964", country: "IQ", label: "+964 (IQ)" },
    { code: "+965", country: "KW", label: "+965 (KW)" },
    { code: "+966", country: "SA", label: "+966 (SA)" },
    { code: "+967", country: "YE", label: "+967 (YE)" },
    { code: "+968", country: "OM", label: "+968 (OM)" },
    { code: "+970", country: "PS", label: "+970 (PS)" },
    { code: "+971", country: "AE", label: "+971 (AE)" },
    { code: "+972", country: "IL", label: "+972 (IL)" },
    { code: "+973", country: "BH", label: "+973 (BH)" },
    { code: "+974", country: "QA", label: "+974 (QA)" },
    { code: "+975", country: "BT", label: "+975 (BT)" },
    { code: "+976", country: "MN", label: "+976 (MN)" },
    { code: "+977", country: "NP", label: "+977 (NP)" },
    { code: "+992", country: "TJ", label: "+992 (TJ)" },
    { code: "+993", country: "TM", label: "+993 (TM)" },
    { code: "+994", country: "AZ", label: "+994 (AZ)" },
    { code: "+995", country: "GE", label: "+995 (GE)" },
    { code: "+996", country: "KG", label: "+996 (KG)" },
    { code: "+998", country: "UZ", label: "+998 (UZ)" },
  ];

  // Filter country codes based on search
  const filteredCountryCodes = countryCodes.filter((item) => {
    const searchLower = countryCodeSearch.toLowerCase();
    return (
      item.code.toLowerCase().includes(searchLower) ||
      item.country.toLowerCase().includes(searchLower) ||
      item.label.toLowerCase().includes(searchLower)
    );
  });

  // Get selected country code label
  const selectedCountryCode = countryCodes.find(
    (item) => item.code === formData.phoneCountryCode
  )?.label || formData.phoneCountryCode || "+91 (IN)";

  const programmes = [
    "B.Tech",
    "M.Tech",
    "PhD",
    "M.Sc",
    "B.Sc",
    "MBA",
    "M.A",
    "B.A",
    "Other",
  ];

  const years = ["1", "2", "3", "4", "5", "6"];

  const disabilityTypes = [
    "Visual Impairment",
    "Hearing Impairment",
    "Locomotor Disability",
    "Intellectual Disability",
    "Mental Illness",
    "Multiple Disabilities",
    "Other",
  ];

  const handleEmailUsernameChange = (emailUsername: string) => {
    const sanitizedEmailUsername = sanitizeIdentifier(emailUsername);
    const emailDomain = formData.emailDomain === "custom" ? "" : formData.emailDomain;
    const fullEmail = emailDomain ? `${sanitizedEmailUsername}@${emailDomain}` : sanitizedEmailUsername;
    const newUsername = sanitizedEmailUsername
      ? sanitizeIdentifier(sanitizedEmailUsername)
      : getUsernameFromEmail(fullEmail);
    setFormData({
      ...formData,
      emailUsername: sanitizedEmailUsername,
      email: fullEmail,
      username: newUsername,
    });
  };

  const handleEmailDomainChange = (emailDomain: string) => {
    const emailUsername = formData.emailUsername || "";
    const fullEmail = emailDomain === "custom" ? emailUsername : (emailUsername ? `${emailUsername}@${emailDomain}` : "");
    const newUsername = emailUsername ? sanitizeIdentifier(emailUsername) : getUsernameFromEmail(fullEmail);
    setFormData({ 
      ...formData, 
      emailDomain,
      email: fullEmail,
      username: newUsername 
    });
  };

  const handleEmailChange = (email: string) => {
    const newUsername = getUsernameFromEmail(email);
    const domain = getDomainFromEmail(email);
    setFormData({ 
      ...formData, 
      email,
      emailUsername: newUsername,
      emailDomain: domain || "custom",
      username: newUsername 
    });
  };

  const buildUserData = (isDraft: boolean = false): CreateUserDto | UpdateUserDto => {
    const sanitizedUsername = sanitizeIdentifier(formData.username || "");
    const userData: CreateUserDto | UpdateUserDto = {
      role: formData.role,
      status: isDraft ? "inactive" : (formData.status || "active"),
    };
    if (formData.role !== "Driver") {
      userData.email = formData.email;
      userData.username = sanitizedUsername;
      if (!user && formData.password) userData.password = formData.password;
    }

    if (formData.name) userData.name = formData.name;
    if (formData.phone) {
      const fullPhone = formData.phoneCountryCode ? `${formData.phoneCountryCode} ${formData.phone}` : formData.phone;
      userData.phone = fullPhone;
    }
    if (formData.profilePicture) userData.profilePicture = formData.profilePicture;
    if (formData.status && !lockSuperAdminFields) {
      userData.status = formData.status;
    }

    if (formData.role === "Student") {
      if (formData.enrollmentNumber) userData.enrollmentNumber = formData.enrollmentNumber;
      if (formData.programme) userData.programme = formData.programme;
      if (formData.year) userData.year = formData.year;
      if (formData.course) userData.course = formData.course;
      if (formData.expiryDate) userData.expiryDate = formData.expiryDate;
      // If "Not, Day Scholar" is selected, use the address input value; otherwise use the hostel selection
      if (formData.hostel === "Not, Day Scholar" && formData.hostelAddress) {
        userData.hostel = formData.hostelAddress;
      } else if (formData.hostel) {
        userData.hostel = formData.hostel;
      }
      if (formData.disabilityType) userData.disabilityType = formData.disabilityType;
      if (formData.disabilityPercentage) {
        userData.disabilityPercentage = parseFloat(formData.disabilityPercentage);
      }
      if (formData.udidNumber) userData.udidNumber = formData.udidNumber;
      if (formData.disabilityCertificate) userData.disabilityCertificate = formData.disabilityCertificate;
      if (formData.idProofType) userData.idProofType = formData.idProofType as 'aadhaar' | 'pan' | 'voter' | 'driverLicense' | 'passport';
      if (formData.idProofDocument) userData.idProofDocument = formData.idProofDocument;
    }

    // Add driver-specific fields (ID Proof)
    if (formData.role === "Driver") {
      if (formData.idProofType) userData.idProofType = formData.idProofType as 'aadhaar' | 'pan' | 'voter' | 'driverLicense' | 'passport';
      if (formData.idProofDocument) userData.idProofDocument = formData.idProofDocument;
    }

    return userData;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validate and get errors
    const validationErrors: Record<string, string> = {};
    
    // Validate Role
    if (!formData.role) {
      validationErrors.role = "Role is required";
    }

    // Email, username, password: required only for non-Driver (Driver uses mobile/OTP)
    if (formData.role !== "Driver") {
      if (!formData.email) {
        validationErrors.email = "Email is required";
      } else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9._%+-]+(\.[A-Za-z0-9._%+-]+)+$/.test(formData.email)) {
        validationErrors.email = "Invalid email format";
      }
      if (!formData.username) {
        validationErrors.username = "Username is required";
      } else if (formData.username.length < 3) {
        validationErrors.username = "Username must be at least 3 characters";
      } else if (!/^[A-Za-z0-9._%+-]+$/.test(formData.username)) {
        validationErrors.username = "Username can only contain letters, numbers, dots, underscores, percent, plus, and hyphens";
      }
      if (!user) {
        if (!formData.password) {
          validationErrors.password = "Password is required";
        } else if (formData.password.length < 8) {
          validationErrors.password = "Password must be at least 8 characters";
        }
      }
    }

    // Validate profile fields for all roles (name, profilePicture)
    if (!formData.name || formData.name.trim() === "") {
      validationErrors.name = "Name is required";
    }
    if (!formData.profilePicture || formData.profilePicture.trim() === "") {
      validationErrors.profilePicture = "Profile Picture is required";
    }
    if (!formData.phone || formData.phone.trim() === "") {
      validationErrors.phone = "Phone is required";
    }

    // Validate Student-specific required fields (only for Student role)
    if (formData.role === "Student") {
      if (!formData.enrollmentNumber || formData.enrollmentNumber.trim() === "") {
        validationErrors.enrollmentNumber = "Entry Number is required";
      }
      if (!formData.programme || formData.programme.trim() === "") {
        validationErrors.programme = "Programme is required";
      }
      if (!formData.year || formData.year.trim() === "") {
        validationErrors.year = "Year is required";
      }
      if (!formData.course || formData.course.trim() === "") {
        validationErrors.course = "Course is required";
      }
      if (!formData.expiryDate || formData.expiryDate.trim() === "") {
        validationErrors.expiryDate = "Expiry Date is required";
      }
      if (formData.hostel === "Not, Day Scholar") {
        // If "Not, Day Scholar" is selected, require the address input
        if (!formData.hostelAddress || formData.hostelAddress.trim() === "") {
          validationErrors.hostel = "Day Scholar Address is required";
        }
      } else {
        // If a hostel is selected, require the hostel selection
        if (!formData.hostel || formData.hostel.trim() === "") {
          validationErrors.hostel = "Hostel Address/Day Scholar Address is required";
        }
      }
      if (!formData.disabilityType || formData.disabilityType.trim() === "") {
        validationErrors.disabilityType = "Disability Type is required";
      }
      if (!formData.disabilityPercentage || formData.disabilityPercentage.toString().trim() === "") {
        validationErrors.disabilityPercentage = "Disability Percentage is required";
      }
      if (!formData.udidNumber || formData.udidNumber.trim() === "") {
        validationErrors.udidNumber = "UDID Number is required";
      }
      if (!formData.disabilityCertificate || formData.disabilityCertificate.trim() === "") {
        validationErrors.disabilityCertificate = "Disability Certificate is required";
      }
      if (!formData.idProofType || formData.idProofType.trim() === "") {
        validationErrors.idProofType = "ID Proof Type is required";
      }
      if (!formData.idProofDocument || formData.idProofDocument.trim() === "") {
        validationErrors.idProofDocument = "ID Proof Document is required";
      }
    }

    // Validate Driver-specific required fields (only for Driver role)
    if (formData.role === "Driver") {
      if (!formData.idProofType || formData.idProofType.trim() === "") {
        validationErrors.idProofType = "ID Proof Type is required";
      }
      if (!formData.idProofDocument || formData.idProofDocument.trim() === "") {
        validationErrors.idProofDocument = "ID Proof Document is required";
      }
    }

    // Validate Terms agreement (required for all submissions)
    if (!formData.agreeToTerms) {
      validationErrors.agreeToTerms = "You must agree to the terms";
    }

    // Set errors and check if validation passed
    setErrors(validationErrors);
    
    if (Object.keys(validationErrors).length > 0) {
      const errorCount = Object.keys(validationErrors).length;
      const fieldLabels: Record<string, string> = {
        role: 'Role',
        email: 'Email',
        username: 'Username',
        password: 'Password',
        name: 'Name',
        profilePicture: 'Profile Picture',
        phone: 'Phone',
        enrollmentNumber: 'Entry Number',
        programme: 'Programme',
        year: 'Year',
        course: 'Course',
        expiryDate: 'Expiry Date',
        hostel: 'Hostel Address',
        disabilityType: 'Disability Type',
        disabilityPercentage: 'Disability Percentage',
        udidNumber: 'UDID Number',
        disabilityCertificate: 'Disability Certificate',
        agreeToTerms: 'Terms Agreement',
      };
      
      const errorMessages = Object.entries(validationErrors)
        .map(([field, msg]) => {
          const fieldLabel = fieldLabels[field] || field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1').trim();
          return `${fieldLabel}: ${msg}`;
        })
        .join('\n');
      
      const fullMessage = `Validation Failed! Please fix the following ${errorCount} error${errorCount > 1 ? 's' : ''}:\n\n${errorMessages}\n\nPlease check the form fields highlighted in red.`;
      showError(fullMessage);
      
      // Scroll to first error field
      const firstErrorField = Object.keys(validationErrors)[0];
      if (firstErrorField) {
        setTimeout(() => {
          // Try multiple selectors to find the error field
          let errorElement = document.querySelector(`input[name="${firstErrorField}"]`) ||
                            document.querySelector(`select[name="${firstErrorField}"]`) ||
                            document.querySelector(`input[type="file"]`) ||
                            document.querySelector(`input[type="checkbox"]`);
          
          // If not found by name, try to find by label
          if (!errorElement) {
            const labels = Array.from(document.querySelectorAll('label'));
            const matchingLabel = labels.find(label => 
              label.textContent?.toLowerCase().includes(firstErrorField.toLowerCase())
            );
            if (matchingLabel) {
              errorElement = matchingLabel.nextElementSibling as HTMLElement;
            }
          }
          
          if (errorElement) {
            (errorElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
            (errorElement as HTMLElement).focus();
          } else {
            // Scroll to form top if element not found
            const form = document.querySelector('form');
            if (form) {
              form.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        }, 200);
      }
      return;
    }

    const userData = buildUserData(false);
    onSave(userData);
  };

  const handleSaveDraft = (e: React.MouseEvent) => {
    e.preventDefault();

    // Clear previous errors
    setErrors({});

    // Basic validation - only check for essential fields for draft
    const draftErrors: Record<string, string> = {};

    if (!formData.role) {
      draftErrors.role = "Role is required";
    }

    if (formData.role !== "Driver") {
      if (!formData.email) draftErrors.email = "Email is required";
      else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9._%+-]+(\.[A-Za-z0-9._%+-]+)+$/.test(formData.email)) draftErrors.email = "Invalid email format";
      if (!formData.username) draftErrors.username = "Username is required";
      else if (formData.username.length < 3) draftErrors.username = "Username must be at least 3 characters";
      else if (!/^[A-Za-z0-9._%+-]+$/.test(formData.username)) draftErrors.username = "Username can only contain letters, numbers, dots, underscores, percent, plus, and hyphens";
      if (formData.password && formData.password.length < 8) draftErrors.password = "Password must be at least 8 characters";
    }

    if (!formData.phone?.trim()) {
      draftErrors.phone = "Phone is required";
    }

    if (Object.keys(draftErrors).length > 0) {
      setErrors(draftErrors);
      // Scroll to first error
      const firstErrorField = Object.keys(draftErrors)[0];
      if (firstErrorField) {
        // Try to find the input element
        const errorElement = document.querySelector(`input[name="${firstErrorField}"]`) ||
                            document.querySelector(`select[name="${firstErrorField}"]`) ||
                            document.querySelector('input[type="text"]');
        
        if (errorElement) {
          (errorElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          (errorElement as HTMLElement).focus();
        }
      }
      return;
    }

    const userData = buildUserData(true);
    onSave(userData);
  };

  const handleRoleChange = (role: string) => {
    setFormData({ ...formData, role });
    setShowStudentFields(role === "Student");
    setShowDriverFields(role === "Driver");
    // Clear role error when role is selected
    if (role && errors.role) {
      setErrors({ ...errors, role: "" });
    }
    // Don't auto-advance - let user click Next button to proceed
  };

  const handleNext = () => {
    // Validate current step before proceeding
    if (currentStep === 0) {
      // Validate Role Selection
      if (!formData.role) {
        setErrors({ 
          role: "Role is required",
        });
        return;
      }
      setErrors({});
      setCurrentStep(1);
      return;
    } else if (currentStep === 1) {
      const newErrors: Record<string, string> = {};
      if (formData.role !== "Driver") {
        if (!formData.email) newErrors.email = "Email is required";
        else if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9._%+-]+(\.[A-Za-z0-9._%+-]+)+$/.test(formData.email)) newErrors.email = "Invalid email format";
        if (!formData.username) newErrors.username = "Username is required";
        if (!user && !formData.password) newErrors.password = "Password is required";
      }
      if (!formData.name) newErrors.name = "Name is required";
      if (!formData.profilePicture) newErrors.profilePicture = "Profile Picture is required";
      if (!formData.phone?.trim()) newErrors.phone = "Phone is required";
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    } else if (currentStep === 2 && showStudentFields) {
      // Validate Institution Details (only for students)
      const newErrors: Record<string, string> = {};
      if (!formData.enrollmentNumber) {
        newErrors.enrollmentNumber = "Entry Number is required";
      }
      if (!formData.programme) {
        newErrors.programme = "Programme is required";
      }
      if (!formData.year) {
        newErrors.year = "Year is required";
      }
      if (!formData.course) {
        newErrors.course = "Course is required";
      }
      if (!formData.expiryDate) {
        newErrors.expiryDate = "Expiry Date is required";
      }
      if (formData.hostel === "Not, Day Scholar") {
        // If "Not, Day Scholar" is selected, require the address input
        if (!formData.hostelAddress || formData.hostelAddress.trim() === "") {
          newErrors.hostel = "Day Scholar Address is required";
        }
      } else {
        // If a hostel is selected, require the hostel selection
        if (!formData.hostel || formData.hostel.trim() === "") {
          newErrors.hostel = "Hostel Address/Day Scholar Address is required";
        }
      }
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    } else if (currentStep === 2 && showDriverFields) {
      // Validate ID Proof (only for drivers)
      const newErrors: Record<string, string> = {};
      if (!formData.idProofType) {
        newErrors.idProofType = "ID Proof Type is required";
      }
      if (!formData.idProofDocument) {
        newErrors.idProofDocument = "ID Proof Document is required";
      }
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    } else if (currentStep === 3 && showStudentFields) {
      // Validate Disability Information (only for students)
      const newErrors: Record<string, string> = {};
      if (!formData.disabilityType) {
        newErrors.disabilityType = "Disability Type is required";
      }
      if (!formData.disabilityPercentage) {
        newErrors.disabilityPercentage = "Disability Percentage is required";
      }
      if (!formData.udidNumber) {
        newErrors.udidNumber = "UDID Number is required";
      }
      if (!formData.disabilityCertificate) {
        newErrors.disabilityCertificate = "Disability Certificate is required";
      }
      
      if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
      }
    }
    
    setErrors({});
    setCurrentStep(currentStep + 1);
  };

  const handlePrevious = () => {
    setErrors({});
    setCurrentStep(currentStep - 1);
  };

  const [uploadingFiles, setUploadingFiles] = useState<Record<string, boolean>>({});

  const handleFileChange = async (
    field: 'profilePicture' | 'disabilityCertificate' | 'idProofDocument',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type for profile picture
    if (field === 'profilePicture') {
      const allowedTypes = ['.jpg', '.jpeg', '.png', '.heif', '.heic'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        setErrors({
          ...errors,
          profilePicture: 'Invalid file type. Allowed types: .jpg, .jpeg, .png, .heif, .heic',
        });
        return;
      }
    }

    // Validate file type for disability certificate
    if (field === 'disabilityCertificate') {
      const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf', '.heif', '.heic'];
      const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
      if (!allowedTypes.includes(fileExtension)) {
        setErrors({
          ...errors,
          disabilityCertificate: 'Invalid file type. Allowed types: .jpg, .jpeg, .png, .pdf, .heif, .heic',
        });
        return;
      }
    }

    // Determine category based on field
    let category: 'profile' | 'document' | 'certificate' = 'document';
    if (field === 'profilePicture') {
      category = 'profile';
    } else if (field === 'disabilityCertificate') {
      category = 'certificate';
    } else if (field === 'idProofDocument') {
      category = 'document';
    }

    setUploadingFiles({ ...uploadingFiles, [field]: true });
    setErrors({ ...errors, [field]: '' });

    try {
      const uploadResponse = await filesService.uploadFile(file, category);
      setFormData({ ...formData, [field]: uploadResponse.url });
    } catch (error) {
      console.error(`Failed to upload ${field}:`, error);
      const err = error as { response?: { data?: { message?: string } } };
      setErrors({
        ...errors,
        [field]: err.response?.data?.message || `Failed to upload ${field}. Please try again.`,
      });
    } finally {
      setUploadingFiles({ ...uploadingFiles, [field]: false });
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      background: "rgba(0, 0, 0, 0.5)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    }}>
      <div className="modal-content" style={{
        background: "var(--card-bg)",
        borderRadius: "1rem",
        padding: "2rem",
        width: "90%",
        maxWidth: "800px",
        maxHeight: "90vh",
        overflow: "auto",
      }}>
        <h2 style={{ marginTop: 0, color: "var(--text-primary)" }}>
          {user ? "Edit User" : "Add User"}
        </h2>
        <form onSubmit={handleSubmit}>
          {/* Step 0: Role Selection */}
          {currentStep === 0 && (
            <>
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Select Role
              </h3>
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Role *
                </label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.role ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                  disabled={lockSuperAdminFields}
                >
                  <option value="">Select Role</option>
                  <option value="Student">Student</option>
                  <option value="Driver">Driver</option>
                  <option value="Admin">Admin</option>
                  {canSetSuperAdminRole && <option value="SuperAdmin">Super Admin</option>}
                </select>
                {errors.role && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.role}
                  </span>
                )}
              </div>
            </>
          )}


          {/* Profile Details */}
          {currentStep === 1 && (
            <>
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Profile Details
              </h3>
              {/* Name */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.name ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                {errors.name && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.name}
                  </span>
                )}
              </div>

              {/* Email, Username, Password: not used for Driver (mobile/OTP login only) */}
              {formData.role !== "Driver" && (
                <>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                      Email *
                    </label>
                    {formData.emailDomain === "custom" ? (
                      <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => handleEmailChange(e.target.value)}
                        placeholder="Enter full email address"
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          border: `1px solid ${errors.email ? "#ef4444" : "var(--card-border)"}`,
                          borderRadius: "0.5rem",
                          background: "var(--bg-primary)",
                          color: "var(--text-primary)",
                        }}
                      />
                    ) : (
                      <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                        <input
                          type="text"
                          required
                          value={formData.emailUsername}
                          onChange={(e) => handleEmailUsernameChange(e.target.value)}
                          placeholder="username"
                          style={{
                            flex: 1,
                            padding: "0.75rem",
                            border: `1px solid ${errors.email ? "#ef4444" : "var(--card-border)"}`,
                            borderRadius: "0.5rem",
                            background: "var(--bg-primary)",
                            color: "var(--text-primary)",
                          }}
                        />
                        <span style={{ padding: "0.75rem 0.5rem", color: "var(--text-primary)", display: "flex", alignItems: "center" }}>@</span>
                        <select
                          required
                          value={formData.emailDomain}
                          onChange={(e) => handleEmailDomainChange(e.target.value)}
                          style={{
                            flex: 1,
                            padding: "0.75rem",
                            border: `1px solid ${errors.email ? "#ef4444" : "var(--card-border)"}`,
                            borderRadius: "0.5rem",
                            background: "var(--bg-primary)",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          {emailDomains.map((domain: { value: string; label: string }) => (
                            <option key={domain.value} value={domain.value}>{domain.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {errors.email && (
                      <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>{errors.email}</span>
                    )}
                  </div>
                  <div style={{ marginBottom: "1rem" }}>
                    <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>Username *</label>
                    <input
                      type="text"
                      required
                      value={formData.username}
                      readOnly
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: `1px solid ${errors.username ? "#ef4444" : "var(--card-border)"}`,
                        borderRadius: "0.5rem",
                        background: "var(--bg-secondary)",
                        color: "var(--text-secondary)",
                        cursor: "not-allowed",
                      }}
                    />
                    {errors.username && (
                      <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>{errors.username}</span>
                    )}
                  </div>
                  {!user && (
                    <div style={{ marginBottom: "1rem" }}>
                      <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>Password</label>
                      <input
                        type="text"
                        value={formData.password}
                        readOnly
                        style={{
                          width: "100%",
                          padding: "0.75rem",
                          border: "1px solid var(--card-border)",
                          borderRadius: "0.5rem",
                          background: "var(--bg-secondary)",
                          color: "var(--text-secondary)",
                          cursor: "not-allowed",
                          fontFamily: "monospace",
                        }}
                      />
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.25rem", display: "block" }}>
                        Password is automatically generated and will be sent to the user's email along with their username.
                      </span>
                    </div>
                  )}
                </>
              )}
              {formData.role === "Driver" && (
                <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginBottom: "1rem" }}>
                  Drivers sign in with phone number and OTP on the mobile app. No email/username/password needed.
                </p>
              )}

              {/* Phone */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Phone *
                </label>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start", position: "relative", width: "100%", minWidth: 0 }}>
                  {/* Searchable Country Code Selector */}
                  <div style={{ position: "relative", width: "140px", minWidth: "140px", flexShrink: 0 }}>
                    <input
                      type="text"
                      value={showCountryCodeDropdown ? countryCodeSearch : selectedCountryCode}
                      onChange={(e) => {
                        setCountryCodeSearch(e.target.value);
                        setShowCountryCodeDropdown(true);
                        // Auto-select if exact match
                        const exactMatch = countryCodes.find(
                          (item) =>
                            item.code.toLowerCase() === e.target.value.toLowerCase() ||
                            item.country.toLowerCase() === e.target.value.toUpperCase() ||
                            item.label.toLowerCase() === e.target.value.toLowerCase()
                        );
                        if (exactMatch) {
                          setFormData({ ...formData, phoneCountryCode: exactMatch.code });
                          setCountryCodeSearch("");
                          setShowCountryCodeDropdown(false);
                        }
                      }}
                      onFocus={() => {
                        setShowCountryCodeDropdown(true);
                        setCountryCodeSearch("");
                      }}
                      placeholder="+91 (IN)"
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: `1px solid ${errors.phone ? "#ef4444" : "var(--card-border)"}`,
                        borderRadius: "0.5rem",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        boxSizing: "border-box",
                      }}
                    />
                    {showCountryCodeDropdown && (
                      <>
                        <div
                          style={{
                            position: "fixed",
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            zIndex: 1000,
                          }}
                          onClick={() => {
                            setShowCountryCodeDropdown(false);
                            setCountryCodeSearch("");
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "100%",
                            left: 0,
                            width: "100%",
                            minWidth: "200px",
                            marginTop: "0.25rem",
                            background: "var(--card-bg)",
                            border: "1px solid var(--card-border)",
                            borderRadius: "0.5rem",
                            maxHeight: "300px",
                            overflowY: "auto",
                            overflowX: "hidden",
                            zIndex: 1001,
                            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
                            boxSizing: "border-box",
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {filteredCountryCodes.length > 0 ? (
                            filteredCountryCodes.map((item) => (
                              <div
                                key={item.code}
                                onClick={() => {
                                  setFormData({ ...formData, phoneCountryCode: item.code });
                                  setShowCountryCodeDropdown(false);
                                  setCountryCodeSearch("");
                                }}
                                style={{
                                  padding: "0.75rem",
                                  cursor: "pointer",
                                  borderBottom: "1px solid var(--card-border)",
                                  color: formData.phoneCountryCode === item.code ? "var(--accent-color)" : "var(--text-primary)",
                                  background: formData.phoneCountryCode === item.code ? "var(--bg-secondary)" : "transparent",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                  boxSizing: "border-box",
                                }}
                                onMouseEnter={(e) => {
                                  if (formData.phoneCountryCode !== item.code) {
                                    e.currentTarget.style.background = "var(--bg-secondary)";
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (formData.phoneCountryCode !== item.code) {
                                    e.currentTarget.style.background = "transparent";
                                  }
                                }}
                              >
                                {item.label}
                              </div>
                            ))
                          ) : (
                            <div style={{ padding: "0.75rem", color: "var(--text-secondary)", textAlign: "center" }}>
                              No country found
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <input
                    type="text"
                    name="phone"
                    autoComplete="tel"
                    value={formData.phone}
                    onChange={(e) => {
                      // Allow A-Z, a-z, 0-9, spaces, hyphens, parentheses, and plus
                      const value = e.target.value.replace(/[^A-Za-z0-9\s()+-]/g, '');
                      setFormData({ ...formData, phone: value });
                    }}
                    placeholder="XXXXXXXXXX"
                    style={{
                      flex: 1,
                      minWidth: 0,
                      padding: "0.75rem",
                      border: `1px solid ${errors.phone ? "#ef4444" : "var(--card-border)"}`,
                      borderRadius: "0.5rem",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                {errors.phone && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.phone}
                  </span>
                )}
              </div>

              {/* Status */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Status {!lockSuperAdminFields && "*"}
                  {lockSuperAdminFields && (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.5rem" }}>
                      (Cannot change status of Super Admin users)
                    </span>
                  )}
                </label>
                <select
                  required={!lockSuperAdminFields}
                  disabled={lockSuperAdminFields}
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.status ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: lockSuperAdminFields ? "var(--bg-tertiary)" : "var(--bg-primary)",
                    color: lockSuperAdminFields ? "var(--text-secondary)" : "var(--text-primary)",
                    cursor: lockSuperAdminFields ? "not-allowed" : "pointer",
                    opacity: lockSuperAdminFields ? 0.6 : 1,
                  }}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="expired">Expired</option>
                  <option value="closed">Closed</option>
                </select>
                {errors.status && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.status}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Profile Picture * (.jpg, .jpeg, .png, .heif, .heic)
                </label>
                <input
                  type="file"
                  required
                  accept=".jpg,.jpeg,.png,.heif,.heic"
                  onChange={(e) => handleFileChange('profilePicture', e)}
                  disabled={uploadingFiles.profilePicture}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.profilePicture ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    opacity: uploadingFiles.profilePicture ? 0.6 : 1,
                  }}
                />
                {uploadingFiles.profilePicture && (
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    Uploading...
                  </span>
                )}
                {formData.profilePicture && !uploadingFiles.profilePicture && (
                  <div style={{ marginTop: "0.5rem" }}>
                    <AuthenticatedProfileImage
                      raw={formData.profilePicture}
                      alt="Profile preview"
                      shape="rounded"
                      fallbackInitial={formData.name?.[0]?.toUpperCase() || "?"}
                    />
                    <p style={{ color: "var(--text-secondary)", fontSize: "0.75rem", marginTop: "0.25rem" }}>
                      Profile picture uploaded successfully
                    </p>
                  </div>
                )}
                {errors.profilePicture && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.profilePicture}
                  </span>
                )}
              </div>

            </>
          )}

          {/* Step 2: Institution Details (Student only) */}
          {currentStep === 2 && showStudentFields && (
            <>
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Institution Details
              </h3>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Entry Number (Enrollment Number) *
                </label>
                <input
                  type="text"
                  required
                  value={formData.enrollmentNumber}
                  onChange={(e) => setFormData({ ...formData, enrollmentNumber: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.enrollmentNumber ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                {errors.enrollmentNumber && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.enrollmentNumber}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Programme *
                </label>
                <select
                  required
                  value={formData.programme}
                  onChange={(e) => setFormData({ ...formData, programme: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.programme ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select Programme</option>
                  {programmes.map((prog) => (
                    <option key={prog} value={prog}>
                      {prog}
                    </option>
                  ))}
                </select>
                {errors.programme && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.programme}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Year *
                </label>
                <select
                  required
                  value={formData.year}
                  onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.year ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select Year</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      Year {year}
                    </option>
                  ))}
                </select>
                {errors.year && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.year}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Course *
                </label>
                <input
                  type="text"
                  required
                  value={formData.course}
                  onChange={(e) => setFormData({ ...formData, course: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.course ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
                {errors.course && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.course}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label
                  htmlFor="user-modal-expiry-date"
                  style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}
                >
                  Expiry date <span aria-hidden="true">*</span>
                </label>
                <DatePicker
                  id="user-modal-expiry-date"
                  selected={formData.expiryDate ? dateFromYmd(formData.expiryDate) : null}
                  onChange={(date: Date | null) =>
                    setFormData({ ...formData, expiryDate: date ? localYmd(date) : "" })
                  }
                  dateFormat="dd/MM/yyyy"
                  placeholderText="dd/mm/yyyy"
                  className={`ride-bill-date-picker-input${errors.expiryDate ? " user-modal-expiry-datepicker--error" : ""}`}
                  wrapperClassName="user-modal-expiry-datepicker"
                  showYearDropdown
                  showMonthDropdown
                  dropdownMode="select"
                  aria-required="true"
                />
                {errors.expiryDate && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.expiryDate}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Hostel/Day Scholar Address *
                </label>
                {formData.hostel === "Not, Day Scholar" ? (
                  <>
                    <input
                      type="text"
                      required
                      value={formData.hostelAddress || ""}
                      onChange={(e) => {
                        // Keep "Not, Day Scholar" as the hostel value and store address separately
                        setFormData({ 
                          ...formData, 
                          hostel: "Not, Day Scholar",
                          hostelAddress: e.target.value 
                        });
                      }}
                      placeholder="Enter Day Scholar Address"
                      style={{
                        width: "100%",
                        padding: "0.75rem",
                        border: `1px solid ${errors.hostel ? "#ef4444" : "var(--card-border)"}`,
                        borderRadius: "0.5rem",
                        background: "var(--bg-primary)",
                        color: "var(--text-primary)",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...formData, hostel: "", hostelAddress: "" });
                      }}
                      style={{
                        marginTop: "0.5rem",
                        padding: "0.5rem 1rem",
                        background: "var(--bg-secondary)",
                        border: "1px solid var(--card-border)",
                        borderRadius: "0.5rem",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                        fontSize: "0.875rem",
                      }}
                    >
                      Select Hostel Instead
                    </button>
                  </>
                ) : (
                  <select
                    required
                    value={formData.hostel}
                    onChange={(e) => {
                      const selectedValue = e.target.value;
                      if (selectedValue === "Not, Day Scholar") {
                        // When "Not, Day Scholar" is selected, clear any previous address
                        setFormData({ ...formData, hostel: selectedValue, hostelAddress: "" });
                      } else {
                        // When a hostel is selected, clear the address field
                        setFormData({ ...formData, hostel: selectedValue, hostelAddress: "" });
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "0.75rem",
                      border: `1px solid ${errors.hostel ? "#ef4444" : "var(--card-border)"}`,
                      borderRadius: "0.5rem",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                    }}
                  >
                    <option value="">Select Hostel</option>
                    {IITD_HOSTELS.map((hostel) => (
                      <option key={hostel} value={hostel}>
                        {hostel}
                      </option>
                    ))}
                  </select>
                )}
                {errors.hostel && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.hostel}
                  </span>
                )}
              </div>
              
            </>
          )}

          {/* Step 2: ID Proof (Driver only) */}
          {currentStep === 2 && showDriverFields && (
            <>
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                ID Proof Information
              </h3>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  ID Proof Type * (Aadhaar / Voter / Driver License / Passport)
                </label>
                <select
                  required
                  value={formData.idProofType}
                  onChange={(e) => setFormData({ ...formData, idProofType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.idProofType ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select ID Proof Type</option>
                  <option value="aadhaar">Aadhaar Card</option>
                  <option value="voter">Voter Card</option>
                  <option value="driverLicense">Driver License</option>
                  <option value="passport">Passport</option>
                </select>
                {errors.idProofType && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.idProofType}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  ID Proof Document * (.jpg, .jpeg, .png, .pdf, .heif, .heic)
                </label>
                <input
                  type="file"
                  required
                  accept=".jpg,.jpeg,.png,.pdf,.heif,.heic"
                  onChange={(e) => handleFileChange('idProofDocument', e)}
                  disabled={uploadingFiles.idProofDocument}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.idProofDocument ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    opacity: uploadingFiles.idProofDocument ? 0.6 : 1,
                  }}
                />
                {uploadingFiles.idProofDocument && (
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    Uploading...
                  </span>
                )}
                {errors.idProofDocument && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.idProofDocument}
                  </span>
                )}
                {formData.idProofDocument && !uploadingFiles.idProofDocument && (
                  <div style={{ marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    ✓ Document uploaded: {formData.idProofDocument.split('/').pop()}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 3: Disability Information (Student only) */}
          {currentStep === 3 && showStudentFields && (
            <>
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Disability Information
              </h3>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Disability Type
                </label>
                <select
                  value={formData.disabilityType}
                  onChange={(e) => setFormData({ ...formData, disabilityType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select Disability Type</option>
                  {disabilityTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Disability Percentage
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.disabilityPercentage}
                  onChange={(e) => setFormData({ ...formData, disabilityPercentage: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  UDID Number
                </label>
                <input
                  type="text"
                  value={formData.udidNumber}
                  onChange={(e) => setFormData({ ...formData, udidNumber: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  Disability Certificate * (.jpg, .jpeg, .png, .pdf, .heif, .heic)
                </label>
                <input
                  type="file"
                  required
                  accept=".jpg,.jpeg,.png,.pdf,.heif,.heic"
                  onChange={(e) => handleFileChange('disabilityCertificate', e)}
                  disabled={uploadingFiles.disabilityCertificate}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.disabilityCertificate ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    opacity: uploadingFiles.disabilityCertificate ? 0.6 : 1,
                  }}
                />
                {uploadingFiles.disabilityCertificate && (
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    Uploading...
                  </span>
                )}
                {errors.disabilityCertificate && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.disabilityCertificate}
                  </span>
                )}
                {formData.disabilityCertificate && !uploadingFiles.disabilityCertificate && (
                  <div style={{ marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    ✓ Certificate uploaded: {formData.disabilityCertificate.split('/').pop()}
                  </div>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  ID Proof Type * (Aadhaar Card / PAN Card / Voter Card)
                </label>
                <select
                  required
                  value={formData.idProofType}
                  onChange={(e) => setFormData({ ...formData, idProofType: e.target.value })}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.idProofType ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  <option value="">Select ID Proof Type</option>
                  <option value="aadhaar">Aadhaar Card</option>
                  <option value="pan">PAN Card</option>
                  <option value="voter">Voter Card</option>
                </select>
                {errors.idProofType && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.idProofType}
                  </span>
                )}
              </div>

              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", marginBottom: "0.5rem", color: "var(--text-primary)" }}>
                  ID Proof Document * (.jpg, .jpeg, .png, .pdf, .heif, .heic)
                </label>
                <input
                  type="file"
                  required
                  accept=".jpg,.jpeg,.png,.pdf,.heif,.heic"
                  onChange={(e) => handleFileChange('idProofDocument', e)}
                  disabled={uploadingFiles.idProofDocument}
                  style={{
                    width: "100%",
                    padding: "0.75rem",
                    border: `1px solid ${errors.idProofDocument ? "#ef4444" : "var(--card-border)"}`,
                    borderRadius: "0.5rem",
                    background: "var(--bg-primary)",
                    color: "var(--text-primary)",
                    opacity: uploadingFiles.idProofDocument ? 0.6 : 1,
                  }}
                />
                {uploadingFiles.idProofDocument && (
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    Uploading...
                  </span>
                )}
                {errors.idProofDocument && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.idProofDocument}
                  </span>
                )}
                {formData.idProofDocument && !uploadingFiles.idProofDocument && (
                  <div style={{ marginTop: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    ✓ Document uploaded: {formData.idProofDocument.split('/').pop()}
                  </div>
                )}
              </div>

            </>
          )}

          {/* Step 4 (Student) or Step 3 (Driver) or Step 2 (Other roles): Checkbox and Submit */}
          {((currentStep === 4 && showStudentFields) || (currentStep === 3 && showDriverFields) || (currentStep === 2 && !showStudentFields && !showDriverFields)) && (
            <>
              <h3 style={{ marginTop: 0, marginBottom: "1.5rem", color: "var(--text-primary)" }}>
                Final Step
              </h3>

              <div style={{ marginBottom: "1.5rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-primary)", cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    name="agreeToTerms"
                    required
                    checked={formData.agreeToTerms}
                    onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
                    style={{
                      width: "1.25rem",
                      height: "1.25rem",
                      cursor: "pointer",
                    }}
                  />
                  <span>I agree to the terms and conditions *</span>
                </label>
                {errors.agreeToTerms && (
                  <span style={{ color: "#ef4444", fontSize: "0.875rem", marginTop: "0.25rem", display: "block" }}>
                    {errors.agreeToTerms}
                  </span>
                )}
              </div>
            </>
          )}

          {/* Navigation Buttons */}
          <div style={{ display: "flex", gap: "1rem", justifyContent: "space-between", marginTop: "1.5rem" }}>
            <div>
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={handlePrevious}
                  style={{
                    padding: "0.75rem 1.5rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "0.5rem",
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                  }}
                >
                  Previous
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  padding: "0.75rem 1.5rem",
                  border: "1px solid var(--card-border)",
                  borderRadius: "0.5rem",
                  background: "transparent",
                  color: "var(--text-primary)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              {!user && (
                <button
                  type="button"
                  onClick={handleSaveDraft}
                  style={{
                    padding: "0.75rem 1.5rem",
                    border: "1px solid var(--card-border)",
                    borderRadius: "0.5rem",
                    background: "transparent",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Save as Draft
                </button>
              )}
              {((currentStep === 4 && showStudentFields) || (currentStep === 3 && showDriverFields) || (currentStep === 2 && !showStudentFields && !showDriverFields)) ? (
                <button
                  type="submit"
                  disabled={!formData.agreeToTerms}
                  style={{
                    padding: "0.75rem 1.5rem",
                    border: "none",
                    borderRadius: "0.5rem",
                    background: formData.agreeToTerms ? "var(--accent-color)" : "var(--bg-secondary)",
                    color: formData.agreeToTerms ? "white" : "var(--text-secondary)",
                    cursor: formData.agreeToTerms ? "pointer" : "not-allowed",
                    fontWeight: 500,
                    opacity: formData.agreeToTerms ? 1 : 0.6,
                  }}
                >
                  {user ? "Update" : "Create"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleNext();
                  }}
                  style={{
                    padding: "0.75rem 1.5rem",
                    border: "none",
                    borderRadius: "0.5rem",
                    background: "var(--accent-color)",
                    color: "white",
                    cursor: "pointer",
                    fontWeight: 500,
                  }}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
