import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from "../../../hooks/auth/useAuth";
import { useTheme } from "../../../hooks/ui/useTheme";
import { useToast, LoadingSpinner, EmptyState } from "../../../components/common";
import AuthenticatedProfileImage from "../../../components/admin/AuthenticatedProfileImage";
import { applyAccentColorVars } from "../../../utils/accentColors";
import { userService } from "../../../services/user/user.service";
import { filesService } from "../../../services/files/files.service";
import authService from "../../../services/auth/auth.service";
import { API_ENDPOINTS } from "../../../services/api/endpoints";
import httpClient from "../../../services/api/http";
import "./Settings.css";

function readStoredAccentColor(): string {
  try {
    const raw = localStorage.getItem("user_appearance");
    if (raw) {
      const parsed = JSON.parse(raw) as { accentColor?: string };
      if (typeof parsed.accentColor === "string" && parsed.accentColor) {
        return parsed.accentColor;
      }
    }
  } catch {
    /* ignore */
  }
  return "blue";
}

type SettingsTab = "profile" | "security" | "theme" | "notification";

interface AccountFormData {
  username: string;
  email: string;
  name: string;
  phone: string;
}

interface PasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

const Settings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const { theme, setTheme } = useTheme();
  const { showSuccess, showError, showWarning } = useToast();
  
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [profileReady, setProfileReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showSessionsModal, setShowSessionsModal] = useState(false);
  const [sessions, setSessions] = useState<Array<Record<string, unknown>>>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loginHistory, setLoginHistory] = useState<Array<Record<string, unknown>>>([]);
  const [sessionsViewMode, setSessionsViewMode] = useState<"active" | "all">("active");
  
  const [accountData, setAccountData] = useState<AccountFormData>({
    username: user?.username || "",
    email: user?.email || "",
    name: (user as unknown as Record<string, unknown>)?.name as string || "",
    phone: (user as unknown as Record<string, unknown>)?.phone as string || "",
  });

  const [passwordData, setPasswordData] = useState<PasswordFormData>({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const [passwordStrength, setPasswordStrength] = useState(0);
  const [passwordWarning, setPasswordWarning] = useState<string>("");
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  const [otpStep, setOtpStep] = useState<"password" | "otp" | "verified">("password");
  const [otp, setOtp] = useState("");
  const [otpTimer, setOtpTimer] = useState(0);

  const [notifications, setNotifications] = useState({
    email: true,
    rideUpdates: true,
    securityAlerts: true,
  });


  /** Match localStorage / AccentSync so we don’t mount as blue then re-apply the real accent. */
  const [appearance, setAppearance] = useState(() => ({
    accentColor: readStoredAccentColor(),
  }));


  const tabs = [
    { id: "profile" as SettingsTab, label: "Profile", icon: "👤", description: "Manage your profile information" },
    { id: "security" as SettingsTab, label: "Security", icon: "🔒", description: "Password & security settings" },
    { id: "theme" as SettingsTab, label: "Appearance", icon: "🎨", description: "Customize theme & display" },
    { id: "notification" as SettingsTab, label: "Notifications", icon: "🔔", description: "Manage notifications" },
  ];

  useEffect(() => {
    const loadUserData = async () => {
      if (!user?.id) {
        setProfileReady(true);
        return;
      }
      setProfileReady(false);
      try {
        const me = await authService.verify();
        const meUser = me.user;
        if (me.session && meUser) {
          setAccountData({
            username: (meUser.username as string) || user.username || "",
            email: (meUser.email as string) || user.email || "",
            name: (meUser.name as string) || "",
            phone: (meUser.phone as string) || "",
          });
          const updatedUser: Record<string, unknown> = {
            id: me.session.user_id.toString(),
            username: (meUser.username as string) || me.session.username,
            email: (meUser.email as string) || me.session.email,
            role: me.session.role,
            name: (meUser.name as string) || "",
            phone: (meUser.phone as string) || "",
            profilePicture: (meUser.profilePicture as string) || "",
          };
          authService.setAuth("cookie-based", updatedUser as unknown as typeof user);
          localStorage.setItem("user", JSON.stringify(updatedUser));
          refreshUser();
          return;
        }

        const userRow = await userService.getUserById(user.id);
        const userAny = userRow as unknown as Record<string, unknown>;
        setAccountData({
          username: userRow.username || "",
          email: userRow.email || "",
          name: (userAny?.name as string) || "",
          phone: (userAny?.phone as string) || "",
        });
        const merged: Record<string, unknown> = {
          id: user.id,
          username: userRow.username,
          email: userRow.email,
          role: userRow.role,
          name: (userAny?.name as string) || "",
          phone: (userAny?.phone as string) || "",
          profilePicture: (userAny?.profilePicture as string) || "",
        };
        authService.setAuth("cookie-based", merged as unknown as typeof user);
        localStorage.setItem("user", JSON.stringify(merged));
        refreshUser();
      } catch (error) {
        console.error('Failed to load user data:', error);
        // Fallback to basic user data if fetch fails
        const userAny = user as unknown as Record<string, unknown>;
        setAccountData({
          username: user.username || "",
          email: user.email || "",
          name: (userAny?.name as string) || "",
          phone: (userAny?.phone as string) || "",
        });
      } finally {
        setProfileReady(true);
      }
    };
    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- omit `user`: `refreshUser()` replaces the object with the same id and would loop if `user` were listed
  }, [user?.id, refreshUser]);

  /** Single place in Settings that maps `appearance` → CSS vars (live preview + after load). */
  useEffect(() => {
    applyAccentColorVars(appearance.accentColor);
  }, [appearance.accentColor]);

  useEffect(() => {
    const loadPreferences = async () => {
      const readCachedNotifications = () => {
        try {
          const raw = localStorage.getItem('user_notifications');
          if (!raw) return null;
          const parsed = JSON.parse(raw) as Partial<typeof notifications>;
          return {
            email: typeof parsed.email === "boolean" ? parsed.email : true,
            rideUpdates: typeof parsed.rideUpdates === "boolean" ? parsed.rideUpdates : true,
            securityAlerts: typeof parsed.securityAlerts === "boolean" ? parsed.securityAlerts : true,
          };
        } catch {
          return null;
        }
      };

      try {
        if (user?.id) {
          try {
            const response = await httpClient.get(API_ENDPOINTS.PREFERENCES);
            const prefs = response.data?.preferences;
            if (prefs) {
              const accentColor = prefs.accentColor || "blue";
              setAppearance({ accentColor });

              const cached = readCachedNotifications();
              // Prefer DB values; if backend hasn't added notif fields yet, keep cached values.
              setNotifications({
                email: typeof prefs.notifEmail === "boolean" ? prefs.notifEmail : (cached?.email ?? true),
                rideUpdates: typeof prefs.notifRideUpdates === "boolean" ? prefs.notifRideUpdates : (cached?.rideUpdates ?? true),
                securityAlerts: typeof prefs.notifSecurityAlerts === "boolean" ? prefs.notifSecurityAlerts : (cached?.securityAlerts ?? true),
              });
              return;
            }
          } catch (error) {
            console.error('Failed to load preferences from database:', error);
          }
        }

        // Fallback to localStorage when API is unavailable
        const savedAppearance = localStorage.getItem('user_appearance');
        if (savedAppearance) {
          const parsed = JSON.parse(savedAppearance);
          const accentColor = parsed.accentColor || "blue";
          setAppearance({ accentColor });
        }
        const cached = readCachedNotifications();
        if (cached) setNotifications(cached);
      } catch (error) {
        console.error('Failed to load saved preferences:', error);
      }
    };
    
    loadPreferences();
  }, [user?.id]);

  useEffect(() => {
    calculatePasswordStrength(passwordData.newPassword);
  }, [passwordData.newPassword]);

  useEffect(() => {
    if (otpTimer > 0) {
      const interval = setInterval(() => {
        setOtpTimer((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [otpTimer, otpStep]);

  // Load sessions count when component mounts or security tab is active
  useEffect(() => {
    const loadSessionsCount = async () => {
      if (user?.id) {
        try {
          const response = await httpClient.get(API_ENDPOINTS.AUTH.SESSIONS);
          if (response.data && response.data.sessions) {
            setSessions(response.data.sessions);
          }
        } catch (error) {
          // Silently fail - sessions will be loaded when modal opens
          console.error('Failed to load sessions count:', error);
        }
      }
    };
    
    // Load sessions when security tab is active or on mount
    if (activeTab === "security") {
      loadSessionsCount();
    }
  }, [activeTab, user?.id]);

  const calculatePasswordStrength = (password: string) => {
    if (!password) {
      setPasswordStrength(0);
      setPasswordWarning("");
      return;
    }

    let strength = 0;
    let warning = "";
    const lowerPassword = password.toLowerCase();
    
    // Common weak patterns to detect
    const commonWeakWords = [
      'password', 'pass', 'passwd', 'admin', 'administrator',
      'hack', 'hacker', 'hacking', 'hacked', 'hacks',
      '123456', '12345678', '123456789', '1234567890',
      'qwerty', 'qwerty123', 'qwertyuiop',
      'abc123', 'abcd1234', 'abcde12345',
      'welcome', 'welcome123', 'letmein',
      'monkey', 'dragon', 'master', 'sunshine',
      'iloveyou', 'princess', 'football', 'baseball',
      'superman', 'batman', 'trustno1', 'shadow'
    ];

    // Check for common weak words
    const foundWeakWord = commonWeakWords.find(word => lowerPassword.includes(word));
    if (foundWeakWord) {
      strength = Math.max(0, strength - 2); // Heavy penalty for weak words
      warning = `Password contains common weak word "${foundWeakWord}". Use a more unique password.`;
    }

    // Check for sequential patterns (12345, abcde, etc.)
    const sequentialPatterns = [
      { pattern: /01234|12345|23456|34567|45678|56789|67890/, name: "sequential numbers" },
      { pattern: /abcdef|bcdefg|cdefgh|defghi|efghij|fghijk|ghijkl|hijklm|ijklmn|jklmno|klmnop|lmnopq|mnopqr|nopqrs|opqrst|pqrstu|qrstuv|rstuvw|stuvwx|tuvwxy|uvwxyz/, name: "sequential letters" },
      { pattern: /qwerty|wertyu|ertyui|rtyuiop|tyuiop|yuiop/, name: "keyboard pattern" },
      { pattern: /asdfgh|sdfghj|dfghjk|fghjkl|ghjkl|hjkl/, name: "keyboard pattern" },
      { pattern: /zxcvbn|cvbnm|vbnm/, name: "keyboard pattern" }
    ];
    
    const foundSequential = sequentialPatterns.find(item => item.pattern.test(lowerPassword));
    if (foundSequential && !warning) {
      strength = Math.max(0, strength - 1);
      warning = `Password contains ${foundSequential.name}. Avoid predictable patterns.`;
    }

    // Check for repeated characters (aaaa, 1111, etc.)
    const hasRepeated = /(.)\1{3,}/.test(password);
    if (hasRepeated && !warning) {
      strength = Math.max(0, strength - 1);
      warning = "Password contains repeated characters. Use more variety.";
    }

    // Check for common substitutions (P@ssw0rd, H@ck123)
    const commonSubstitutions = [
      { pattern: /p[@a]ssw[o0]rd/i, name: "password" },
      { pattern: /h[@a]ck/i, name: "hack" },
      { pattern: /[@a]dm[i1]n/i, name: "admin" },
      { pattern: /p[@a]ss/i, name: "pass" }
    ];
    
    const foundSubstitution = commonSubstitutions.find(item => item.pattern.test(password));
    if (foundSubstitution && !warning) {
      strength = Math.max(0, strength - 2);
      warning = `Password uses common substitution for "${foundSubstitution.name}". This is easily guessed.`;
    }

    // Positive factors
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (password.length >= 16) strength++;
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    // Bonus for mixed case and special chars together
    if (/[a-z]/.test(password) && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^a-zA-Z0-9]/.test(password)) {
      strength++;
    }

    // Ensure strength is between 0 and 5
    setPasswordStrength(Math.max(0, Math.min(strength, 5)));
    setPasswordWarning(warning);
  };

  const getPasswordStrengthLabel = () => {
    // More strict thresholds - require higher strength for Medium/Strong
    if (passwordStrength <= 2) return { label: "Weak", color: "#dc2626", bgColor: "#fee2e2" };
    if (passwordStrength <= 4) return { label: "Medium", color: "#d97706", bgColor: "#fef3c7" };
    // Only 5 strength points = Strong (requires all criteria + no weak patterns)
    return { label: "Strong", color: "#059669", bgColor: "#d1fae5" };
  };

  const isPasswordStrong = () => {
    // Password is "Strong" only if strength is 5 and meets all requirements
    if (passwordStrength !== 5) return false;
    const pwd = passwordData.newPassword;
    return (
      pwd.length >= 8 &&
      /[a-z]/.test(pwd) &&
      /[A-Z]/.test(pwd) &&
      /[0-9]/.test(pwd) &&
      /[^a-zA-Z0-9]/.test(pwd)
    );
  };

  const handleAccountChange = (field: keyof AccountFormData, value: string) => {
    setAccountData((prev) => ({ ...prev, [field]: value }));
  };

  const handlePasswordChange = (field: keyof PasswordFormData, value: string) => {
    setPasswordData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAppearanceChange = (field: keyof typeof appearance, value: string) => {
    setAppearance((prev) => ({ ...prev, [field]: value }));
  };


  const validateAccountForm = (): boolean => {
    if (!accountData.username.trim()) {
      showError("Username is required");
      return false;
    }
    if (!accountData.email.trim()) {
      showError("Email is required");
      return false;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountData.email)) {
      showError("Please enter a valid email address");
      return false;
    }
    return true;
  };

  const validatePasswordForm = (): boolean => {
    if (!passwordData.currentPassword) {
      showError("Current password is required");
      return false;
    }
    if (!passwordData.newPassword) {
      showError("New password is required");
      return false;
    }
    if (!isPasswordStrong()) {
      showError("Password must be Strong (meet all requirements including Numbers) to proceed");
      return false;
    }
    if (passwordData.newPassword.length < 8) {
      showError("Password must be at least 8 characters long");
      return false;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showError("New passwords do not match");
      return false;
    }
    if (passwordData.currentPassword === passwordData.newPassword) {
      showError("New password must be different from current password");
      return false;
    }
    return true;
  };

  const handleSaveAccount = async () => {
    if (!validateAccountForm() || !user?.id) return;
    
    setIsLoading(true);
    try {
      // Update user profile via API
      const updateData: Record<string, unknown> = {};
      const userAny = user as unknown as Record<string, unknown>;
      if (accountData.name !== ((userAny?.name as string) || "")) {
        updateData.name = accountData.name;
      }
      if (accountData.email !== user.email) {
        updateData.email = accountData.email;
      }
      if (accountData.username !== user.username) {
        updateData.username = accountData.username;
      }
      if (accountData.phone !== ((userAny?.phone as string) || "")) {
        updateData.phone = accountData.phone;
      }

      if (Object.keys(updateData).length === 0) {
        showWarning("No changes to save");
        setIsLoading(false);
        return;
      }

      await userService.updateUser(user.id, updateData);
      
      // Refresh user data from server
      try {
        const response = await authService.verify();
        if (response.session) {
          const updatedUser: Record<string, unknown> = {
            id: (response.session.user_id as number).toString(),
            username: response.session.username,
            email: response.session.email,
            role: response.session.role,
            name: accountData.name,
            phone: accountData.phone,
          };
          authService.setAuth('cookie-based', updatedUser as unknown as typeof user);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          refreshUser();
        }
      } catch (refreshError) {
        console.error('Failed to refresh user data:', refreshError);
      }

      showSuccess("Account settings saved successfully!");
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || "Failed to save account settings";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOTP = async () => {
    if (!validatePasswordForm() || !user?.email) return;
    
    setIsLoading(true);
    try {
      // Call backend OTP endpoint using httpClient
      await httpClient.post(API_ENDPOINTS.AUTH.SEND_OTP, {
        email: user.email,
      });

      setOtpStep("otp");
      setOtpTimer(300); // 5 minutes timer
      showSuccess(`OTP sent to ${user.email}. Please check your inbox (or server logs for development).`);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || "Failed to send OTP. Please try again.";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (!user?.email) return;
    
    setIsLoading(true);
    try {
      // Call backend OTP endpoint again using httpClient
      await httpClient.post(API_ENDPOINTS.AUTH.SEND_OTP, {
        email: user.email,
      });

      setOtpTimer(300);
      setOtp("");
      showSuccess("OTP resent successfully!");
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } }; message?: string };
      const errorMessage = err.response?.data?.error || err.message || "Failed to resend OTP. Please try again.";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp || otp.length !== 6 || !user?.email) {
      showError("Please enter a valid 6-digit OTP");
      return;
    }

    setIsLoading(true);
    try {
      // Call backend OTP verification endpoint using httpClient
      const response = await httpClient.post(API_ENDPOINTS.AUTH.VERIFY_OTP, {
        email: user.email,
        otp,
      });

      if (!response.data.valid) {
        throw new Error(response.data.message || 'Invalid OTP');
      }

      setOtpStep("verified");
      showSuccess("OTP verified successfully!");
      
      // Now change the password
      await handleChangePasswordAfterOTP();
    } catch (error) {
      const err = error as { response?: { data?: { message?: string; error?: string } }; message?: string };
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message || "Failed to verify OTP. Please try again.";
      showError(errorMessage);
      setOtp("");
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePasswordAfterOTP = async () => {
    if (!user?.id) return;
    
    setIsLoading(true);
    try {
      // Update password via API
      // Note: Backend doesn't verify current password, so we rely on OTP verification
      await userService.updateUser(user.id, {
        password: passwordData.newPassword,
      });
      
      showSuccess("Password changed successfully!");
      
      // Reset all states
      setPasswordData({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setOtp("");
      setOtpStep("password");
      setOtpTimer(0);
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || "Failed to change password. Please try again.";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelPasswordChange = () => {
    setPasswordData({
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    });
    setOtp("");
    setOtpStep("password");
    setOtpTimer(0);
  };

  const handleViewSessions = async () => {
    setShowSessionsModal(true);
    setLoadingSessions(true);
    try {
      // Fetch both active sessions and login history
      const [sessionsResponse, historyResponse] = await Promise.all([
        httpClient.get(API_ENDPOINTS.AUTH.SESSIONS),
        httpClient.get(API_ENDPOINTS.AUTH.LOGIN_HISTORY).catch(() => ({ data: { history: [] } }))
      ]);
      
      if (sessionsResponse.data && sessionsResponse.data.sessions) {
        setSessions(sessionsResponse.data.sessions);
      } else {
        setSessions([]);
      }
      
      if (historyResponse.data && historyResponse.data.history) {
        setLoginHistory(historyResponse.data.history);
      } else {
        setLoginHistory([]);
      }
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || "Failed to load sessions";
      showError(errorMessage);
      setSessions([]);
      setLoginHistory([]);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (session?.isCurrent) {
      showWarning("You cannot revoke your current session from here. Please logout instead.");
      return;
    }

    setIsLoading(true);
    try {
      await httpClient.delete(API_ENDPOINTS.AUTH.SESSION_BY_ID(sessionId));
      
      // Refresh sessions list from server to ensure consistency
      try {
        const response = await httpClient.get(API_ENDPOINTS.AUTH.SESSIONS);
        if (response.data && response.data.sessions) {
          setSessions(response.data.sessions);
        } else {
          // Fallback: Remove from local state
          setSessions((prev) => prev.filter((s: Record<string, unknown>) => s.id !== sessionId));
        }
      } catch {
        // Fallback: Remove from local state if refresh fails
        setSessions((prev) => prev.filter((s: Record<string, unknown>) => s.id !== sessionId));
      }
      
      showSuccess("Session revoked successfully");
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || "Failed to revoke session";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevokeAllSessions = async () => {
    const otherSessionsCount = sessions.filter((s: Record<string, unknown>) => !s.isCurrent).length;
    if (otherSessionsCount === 0) {
      showWarning("No other sessions to revoke");
      return;
    }
    
    if (!window.confirm(`Are you sure you want to revoke all ${otherSessionsCount} other session${otherSessionsCount > 1 ? "s" : ""}? You will remain logged in on this device.`)) {
      return;
    }

    setIsLoading(true);
    try {
      await httpClient.delete(API_ENDPOINTS.AUTH.SESSIONS);
      
      // Refresh sessions list from server to ensure consistency
      try {
        const response = await httpClient.get(API_ENDPOINTS.AUTH.SESSIONS);
        if (response.data && response.data.sessions) {
          setSessions(response.data.sessions);
        } else {
          // Fallback: Update local state to only show current session
          setSessions((prev) => prev.filter((s: Record<string, unknown>) => s.isCurrent));
        }
      } catch {
        // Fallback: Update local state if refresh fails
        setSessions((prev) => prev.filter((s: Record<string, unknown>) => s.isCurrent));
      }
      
      showSuccess("All other sessions revoked successfully");
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || "Failed to revoke sessions";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Time display component (updates only when dateString changes, not continuously)
  const AutoTimeDisplay: React.FC<{ dateString: string }> = ({ dateString }) => {
    const formatted = useMemo(() => {
      const date = new Date(dateString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffSecs = Math.floor(diffMs / 1000);
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      // Show seconds for very recent (less than 1 minute)
      if (diffSecs < 60) {
        if (diffSecs < 10) return "Just now";
        return `${diffSecs} second${diffSecs !== 1 ? "s" : ""} ago`;
      }

      // Show minutes for recent (less than 1 hour)
      if (diffMins < 60) {
        return `${diffMins} minute${diffMins !== 1 ? "s" : ""} ago`;
      }

      // Show hours for today (less than 24 hours)
      if (diffHours < 24) {
        return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
      }

      // Show date for older entries
      const isToday = date.toDateString() === now.toDateString();
      const isYesterday = date.toDateString() === new Date(now.getTime() - 86400000).toDateString();
      
      if (isToday) {
        const timeStr = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
        return `Today at ${timeStr}`;
      } else if (isYesterday) {
        const timeStr = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
        return `Yesterday at ${timeStr}`;
      } else if (diffDays < 7) {
        // Within a week, show day name
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const dayName = dayNames[date.getDay()];
        const timeStr = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
        return `${dayName} at ${timeStr}`;
      } else {
        // Older than a week, show full date
        const dateStr = date.toLocaleDateString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined 
        });
        const timeStr = date.toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: true 
        });
        return `${dateStr} at ${timeStr}`;
      }
    }, [dateString]);

    return <span>{formatted}</span>;
  };


  const formatFullDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Helper to get device icon based on device info
  const getDeviceIcon = (device: string): string => {
    const deviceLower = device.toLowerCase();
    if (deviceLower.includes('iphone') || deviceLower.includes('ipad')) return '📱';
    if (deviceLower.includes('android')) return '🤖';
    if (deviceLower.includes('mac') || deviceLower.includes('safari')) return '💻';
    if (deviceLower.includes('windows')) return '🪟';
    if (deviceLower.includes('linux')) return '🐧';
    return '💻';
  };

  // Helper to get browser icon
  const getBrowserIcon = (device: string): string => {
    const deviceLower = device.toLowerCase();
    if (deviceLower.includes('chrome')) return '🌐';
    if (deviceLower.includes('firefox')) return '🦊';
    if (deviceLower.includes('safari')) return '🧭';
    if (deviceLower.includes('edge')) return '🔷';
    return '🌐';
  };

  // Helper to check if session is recent (within last hour)
  const isRecentSession = (lastActive: string): boolean => {
    const date = new Date(lastActive);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return diffMs < 60 * 60 * 1000; // Less than 1 hour
  };

  const handleSaveNotifications = async () => {
    setIsLoading(true);
    try {
      await httpClient.put(API_ENDPOINTS.PREFERENCES, {
        notifEmail:          notifications.email,
        notifRideUpdates:    notifications.rideUpdates,
        notifSecurityAlerts: notifications.securityAlerts,
      });
      // Keep localStorage in sync as a fallback cache
      localStorage.setItem('user_notifications', JSON.stringify(notifications));
      showSuccess("Notification preferences saved!");
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      // Fallback so refresh keeps the latest toggle state even if backend save fails.
      localStorage.setItem('user_notifications', JSON.stringify(notifications));
      showWarning(err.response?.data?.error || "Saved locally only. Backend notification save failed.");
    } finally {
      setIsLoading(false);
    }
  };


  const handleProfilePictureChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    if (file.size > 5 * 1024 * 1024) {
      showError("Image size must be less than 5MB");
      return;
    }

    if (!file.type.startsWith("image/")) {
      showError("Please select an image file");
      return;
    }

    setIsLoading(true);
    try {
      // Upload file to server
      const uploadResponse = await filesService.uploadFile(file, 'profile');
      
      // Update user profile with new picture URL
      await userService.updateUser(user.id, {
        profilePicture: uploadResponse.url,
      });

      // Refresh user data from server
      try {
        const response = await authService.verify();
        const responseData = response as { session?: Record<string, unknown>; user?: Record<string, unknown> };
        if (response.session && responseData.user) {
          const fullUser = responseData.user;
          const updatedUser: Record<string, unknown> = {
            id: (response.session.user_id as number).toString(),
            username: response.session.username,
            email: response.session.email,
            role: response.session.role,
            name: (fullUser.name as string) || "",
            phone: (fullUser.phone as string) || "",
            profilePicture: (fullUser.profilePicture as string) || uploadResponse.url,
          };
          authService.setAuth('cookie-based', updatedUser as unknown as typeof user);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          refreshUser();
        } else if (response.session) {
          const updatedUser: Record<string, unknown> = {
            id: (response.session.user_id as number).toString(),
            username: response.session.username,
            email: response.session.email,
            role: response.session.role,
            profilePicture: uploadResponse.url,
          };
          authService.setAuth('cookie-based', updatedUser as unknown as typeof user);
          localStorage.setItem('user', JSON.stringify(updatedUser));
          refreshUser();
        }
      } catch (refreshError) {
        console.error('Failed to refresh user data:', refreshError);
      }

      showSuccess("Profile picture updated successfully!");
    } catch (error) {
      const err = error as { response?: { data?: { error?: string } } };
      const errorMessage = err.response?.data?.error || "Failed to upload profile picture";
      showError(errorMessage);
    } finally {
      setIsLoading(false);
      // Reset file input
      e.target.value = '';
    }
  };

  if (!profileReady) {
    return (
      <div className="settings-page">
        <LoadingSpinner message="Loading settings…" variant="page" />
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-container">
        <aside className="settings-sidebar">
          <nav className="settings-nav">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`settings-nav-item ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
                title={tab.description}
              >
                <span className="nav-icon">{tab.icon}</span>
                <div className="nav-content">
                  <span className="nav-label">{tab.label}</span>
                  <span className="nav-description">{tab.description}</span>
                </div>
              </button>
            ))}
          </nav>
        </aside>

        <main className="settings-content">
          {activeTab === "profile" && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Profile Information</h2>
                <p>Update your profile picture and personal information</p>
              </div>

              <div className="profile-picture-section">
                <div className="profile-picture-wrapper">
                  <div className="profile-picture">
                    <AuthenticatedProfileImage
                      raw={user?.profilePicture}
                      alt="Profile"
                      fallbackInitial={(
                        (user?.name?.charAt(0) || user?.username?.charAt(0) || "U")
                      ).toUpperCase()}
                      size={120}
                      shape="circle"
                      className="profile-picture-img"
                    />
                    <div className="profile-overlay">
                      <label className="profile-upload-btn" title="Change profile picture">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleProfilePictureChange}
                          disabled={isLoading}
                        />
                        {isLoading ? (
                          <div className="upload-spinner"></div>
                        ) : (
                          <>
                            <span className="upload-icon">📷</span>
                            <span className="upload-text">Change Photo</span>
                          </>
                        )}
                      </label>
                    </div>
                  </div>
                </div>
                <div className="profile-info">
                  <p className="profile-name">{user?.username || "User"}</p>
                  <p className="profile-hint">Click the photo above to upload a new profile picture (Max 5MB)</p>
                </div>
              </div>

              <div className="settings-form">
                <div className="form-row">
                  <div className="form-group">
                    <label>Full Name</label>
                    <input
                      type="text"
                      value={accountData.name}
                      onChange={(e) => handleAccountChange("name", e.target.value)}
                      className="form-input"
                      placeholder="Enter your full name"
                    />
                  </div>
                  <div className="form-group">
                    <label>Username</label>
                    <input
                      type="text"
                      value={accountData.username}
                      onChange={(e) => handleAccountChange("username", e.target.value)}
                      className="form-input"
                      placeholder="Enter username"
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      value={accountData.email}
                      onChange={(e) => handleAccountChange("email", e.target.value)}
                      className="form-input"
                      placeholder="Enter email address"
                    />
                  </div>
                  <div className="form-group">
                    <label>Phone Number</label>
                    <input
                      type="tel"
                      value={accountData.phone}
                      onChange={(e) => handleAccountChange("phone", e.target.value)}
                      className="form-input"
                      placeholder="Enter phone number"
                    />
                  </div>
                </div>

                <div className="form-actions">
                  <button
                    className="save-btn"
                    onClick={handleSaveAccount}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <span className="btn-spinner"></span>
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <span>✓</span>
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                  <button
                    className="cancel-btn"
                    onClick={() => {
                      const userAny = user as unknown as Record<string, unknown>;
                      setAccountData({
                        username: user?.username || "",
                        email: user?.email || "",
                        name: (userAny?.name as string) || "",
                        phone: (userAny?.phone as string) || "",
                      });
                    }}
                    disabled={isLoading}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Security Settings</h2>
                <p>Change your password and manage security options</p>
              </div>

              <div className="settings-form">
                <div className="form-group">
                  <label>Current Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPasswords.current ? "text" : "password"}
                      value={passwordData.currentPassword}
                      onChange={(e) => handlePasswordChange("currentPassword", e.target.value)}
                      className="form-input"
                      placeholder="Enter current password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPasswords((prev) => ({ ...prev, current: !prev.current }))}
                    >
                      {showPasswords.current ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                </div>

                <div className="form-group">
                  <label>New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => handlePasswordChange("newPassword", e.target.value)}
                      className="form-input"
                      placeholder="Enter new password"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPasswords((prev) => ({ ...prev, new: !prev.new }))}
                    >
                      {showPasswords.new ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                  {passwordData.newPassword && (
                    <>
                      <div className="password-strength-container">
                        <div className="password-strength">
                          <span className="password-strength-text">Password:</span>
                          <span 
                            className="password-strength-label" 
                            style={{ 
                              color: getPasswordStrengthLabel().color,
                              backgroundColor: getPasswordStrengthLabel().bgColor,
                              padding: "0.25rem 0.75rem",
                              borderRadius: "0.375rem",
                              fontWeight: "600",
                              fontSize: "0.875rem"
                            }}
                          >
                            {getPasswordStrengthLabel().label}
                          </span>
                        </div>
                        <div className="password-strength-bar">
                          <div
                            className="password-strength-fill"
                            style={{
                              width: `${(passwordStrength / 5) * 100}%`,
                              backgroundColor: getPasswordStrengthLabel().color,
                            }}
                          />
                        </div>
                      </div>
                      {passwordWarning && (
                        <div className="password-warning">
                          <span className="warning-icon">⚠️</span>
                          <span className="warning-text">{passwordWarning}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div className="password-requirements">
                    <p className="password-requirements-title">Your password should contain:</p>
                    <ul className="password-requirements-list">
                      <li className={passwordData.newPassword.length >= 8 ? "requirement-met" : ""}>
                        At least 8 characters
                      </li>
                      <li className={/[a-z]/.test(passwordData.newPassword) ? "requirement-met" : ""}>
                        Lowercase letters
                      </li>
                      <li className={/[A-Z]/.test(passwordData.newPassword) ? "requirement-met" : ""}>
                        Uppercase letters
                      </li>
                      <li className={/[0-9]/.test(passwordData.newPassword) ? "requirement-met" : ""}>
                        Numbers
                      </li>
                      <li className={/[^a-zA-Z0-9]/.test(passwordData.newPassword) ? "requirement-met" : ""}>
                        Special characters
                      </li>
                    </ul>
                  </div>
                </div>

                <div className="form-group">
                  <label>Confirm New Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => handlePasswordChange("confirmPassword", e.target.value)}
                      className={`form-input ${passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword ? "error" : ""} ${!isPasswordStrong() ? "disabled-input" : ""}`}
                      placeholder={isPasswordStrong() ? "Confirm new password" : "Password must be Strong to confirm"}
                      disabled={!isPasswordStrong()}
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      onClick={() => setShowPasswords((prev) => ({ ...prev, confirm: !prev.confirm }))}
                      disabled={!isPasswordStrong()}
                    >
                      {showPasswords.confirm ? "👁️" : "👁️‍🗨️"}
                    </button>
                  </div>
                  {!isPasswordStrong() && passwordData.newPassword && (
                    <p className="form-hint password-requirement-hint">
                      Password must be <strong>Strong</strong> (meet all requirements including Numbers) to enable confirmation.
                    </p>
                  )}
                  {passwordData.confirmPassword && passwordData.newPassword !== passwordData.confirmPassword && isPasswordStrong() && (
                    <p className="form-error">Passwords do not match</p>
                  )}
                </div>

                {otpStep === "password" && (
                  <div className="form-actions">
                    <button
                      className="save-btn"
                      onClick={handleSendOTP}
                      disabled={isLoading || !passwordData.currentPassword || !passwordData.newPassword || !isPasswordStrong() || !passwordData.confirmPassword}
                    >
                      {isLoading ? (
                        <>
                          <span className="btn-spinner"></span>
                          <span>Sending OTP...</span>
                        </>
                      ) : (
                        <>
                          <span>📧</span>
                          <span>Send OTP to Email</span>
                        </>
                      )}
                    </button>
                    <button
                      className="cancel-btn"
                      onClick={handleCancelPasswordChange}
                      disabled={isLoading}
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {otpStep === "otp" && (
                  <div className="otp-verification-section">
                    <div className="otp-header">
                      <h3>Email Verification</h3>
                      <p>We've sent a 6-digit OTP to <strong>{user?.email || "your email"}</strong></p>
                      {otpTimer > 0 && (
                        <p className="otp-timer">
                          OTP expires in: <strong>{Math.floor(otpTimer / 60)}:{(otpTimer % 60).toString().padStart(2, '0')}</strong>
                        </p>
                      )}
                    </div>

                    <div className="form-group">
                      <label>Enter OTP</label>
                      <div className="otp-input-wrapper">
                        <input
                          type="text"
                          value={otp}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 6);
                            setOtp(value);
                          }}
                          className="otp-input"
                          placeholder="000000"
                          maxLength={6}
                          disabled={isLoading || otpTimer === 0}
                        />
                      </div>
                      {otpTimer === 0 && (
                        <p className="form-error">OTP has expired. Please request a new one.</p>
                      )}
                    </div>

                    <div className="form-actions">
                      <button
                        className="save-btn"
                        onClick={handleVerifyOTP}
                        disabled={isLoading || otp.length !== 6 || otpTimer === 0}
                      >
                        {isLoading ? (
                          <>
                            <span className="btn-spinner"></span>
                            <span>Verifying...</span>
                          </>
                        ) : (
                          <>
                            <span>✓</span>
                            <span>Verify OTP</span>
                          </>
                        )}
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={handleResendOTP}
                        disabled={isLoading || otpTimer > 240}
                      >
                        {otpTimer > 240 ? "Resend OTP (available soon)" : "Resend OTP"}
                      </button>
                      <button
                        className="cancel-btn"
                        onClick={handleCancelPasswordChange}
                        disabled={isLoading}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {otpStep === "verified" && (
                  <div className="otp-success-section">
                    <div className="success-message">
                      <span className="success-icon">✓</span>
                      <p>OTP verified successfully! Changing password...</p>
                    </div>
                  </div>
                )}

                <div className="security-section">
                  <h3>Additional Security</h3>
                  <div className="security-item">
                    <div className="security-info">
                      <h4>Sessions & Login History</h4>
                      <p>Manage active sessions and view your login history</p>
                    </div>
                    <button 
                      className="security-btn secondary"
                      onClick={handleViewSessions}
                    >
                      View All ({sessions.length || 0} active)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "theme" && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Appearance Settings</h2>
                <p>Customize how the application looks and feels</p>
              </div>

              <div className="appearance-options">
                {/* Theme Selection */}
                <div className="appearance-group">
                  <div className="appearance-group-header">
                    <h3>Theme</h3>
                    <p>Choose your preferred color theme</p>
                  </div>
                  <div className="theme-selector">
                    <button
                      className={`theme-btn ${theme === "light" ? "active" : ""}`}
                      onClick={() => {
                        setTheme("light");
                        showSuccess("Theme changed to Light");
                      }}
                    >
                      <span className="theme-icon">☀️</span>
                      <div>
                        <div className="theme-btn-label">Light</div>
                        <div className="theme-btn-desc">Clean and bright</div>
                      </div>
                    </button>
                    <button
                      className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                      onClick={() => {
                        setTheme("dark");
                        showSuccess("Theme changed to Dark");
                      }}
                    >
                      <span className="theme-icon">🌙</span>
                      <div>
                        <div className="theme-btn-label">Dark</div>
                        <div className="theme-btn-desc">Easy on the eyes</div>
                      </div>
                    </button>
                    <button
                      className={`theme-btn ${theme === "system" ? "active" : ""}`}
                      onClick={() => {
                        setTheme("system");
                        showSuccess("Theme set to System");
                      }}
                    >
                      <span className="theme-icon">💻</span>
                      <div>
                        <div className="theme-btn-label">System</div>
                        <div className="theme-btn-desc">Follows your OS</div>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Accent Color */}
                <div className="appearance-group">
                  <div className="appearance-group-header">
                    <h3>Accent Color</h3>
                    <p>Choose your preferred accent color</p>
                  </div>
                  <div className="color-selector">
                    {[
                      { name: "blue", color: "#3b82f6", label: "Blue" },
                      { name: "indigo", color: "#6366f1", label: "Indigo" },
                      { name: "purple", color: "#8b5cf6", label: "Purple" },
                      { name: "violet", color: "#a855f7", label: "Violet" },
                      { name: "fuchsia", color: "#d946ef", label: "Fuchsia" },
                      { name: "pink", color: "#ec4899", label: "Pink" },
                      { name: "rose", color: "#f43f5e", label: "Rose" },
                      { name: "red", color: "#ef4444", label: "Red" },
                      { name: "orange", color: "#f97316", label: "Orange" },
                      { name: "amber", color: "#f59e0b", label: "Amber" },
                      { name: "yellow", color: "#eab308", label: "Yellow" },
                      { name: "lime", color: "#84cc16", label: "Lime" },
                      { name: "green", color: "#22c55e", label: "Green" },
                      { name: "emerald", color: "#10b981", label: "Emerald" },
                      { name: "teal", color: "#14b8a6", label: "Teal" },
                      { name: "cyan", color: "#06b6d4", label: "Cyan" },
                      { name: "sky", color: "#0ea5e9", label: "Sky" },
                    ].map((colorOption) => (
                      <button
                        key={colorOption.name}
                        className={`color-btn ${appearance.accentColor === colorOption.name ? "active" : ""}`}
                        onClick={() => handleAppearanceChange("accentColor", colorOption.name)}
                        title={colorOption.label}
                      >
                        <span
                          className="color-swatch"
                          style={{ backgroundColor: colorOption.color }}
                        />
                        {appearance.accentColor === colorOption.name && (
                          <span className="color-check">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="save-btn"
                  onClick={async () => {
                    setIsLoading(true);
                    try {
                      // Save appearance preferences to database
                      await httpClient.put(API_ENDPOINTS.PREFERENCES, {
                        accentColor: appearance.accentColor,
                      });
                      
                      // Also save to localStorage as backup
                      localStorage.setItem('user_appearance', JSON.stringify(appearance));
                      
                      showSuccess("Appearance settings saved!");
                    } catch (error) {
                      const err = error as { response?: { data?: { error?: string } } };
                      const errorMessage = err.response?.data?.error || "Failed to save appearance settings";
                      showError(errorMessage);
                    } finally {
                      setIsLoading(false);
                    }
                  }}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="btn-spinner"></span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>Save Appearance Settings</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {activeTab === "notification" && (
            <div className="settings-section">
              <div className="section-header">
                <h2>Notification Settings</h2>
                <p>Choose how and when you want to be notified</p>
              </div>

              <div className="notification-options">
                <div className="notification-category">
                  <div className="notification-item">
                    <div className="notification-info">
                      <h4>Email Notifications</h4>
                      <p>Send bill receipts and account updates to your email</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={notifications.email}
                        onChange={() => handleNotificationChange("email")}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="notification-item">
                    <div className="notification-info">
                      <h4>Ride Updates</h4>
                      <p>Get notified when ride bills are created or their status changes</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={notifications.rideUpdates}
                        onChange={() => handleNotificationChange("rideUpdates")}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                  <div className="notification-item">
                    <div className="notification-info">
                      <h4>Security Alerts</h4>
                      <p>Receive alerts for login attempts and security events on your account</p>
                    </div>
                    <label className="toggle-switch">
                      <input
                        type="checkbox"
                        checked={notifications.securityAlerts}
                        onChange={() => handleNotificationChange("securityAlerts")}
                      />
                      <span className="toggle-slider"></span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="form-actions">
                <button
                  className="save-btn"
                  onClick={handleSaveNotifications}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <span className="btn-spinner"></span>
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <span>✓</span>
                      <span>Save Preferences</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* Active Sessions Modal */}
      {showSessionsModal && (
        <div className="modal-overlay" onClick={() => setShowSessionsModal(false)}>
          <div className="sessions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sessions-modal-header">
              <div>
                <h2>Sessions & Login History</h2>
                <p className="modal-subtitle">Manage active sessions and view login history</p>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setShowSessionsModal(false)}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="sessions-modal-tabs">
              <button
                className={`sessions-tab ${sessionsViewMode === "active" ? "active" : ""}`}
                onClick={() => setSessionsViewMode("active")}
              >
                <span>🟢</span>
                <span>Active ({sessions.length})</span>
              </button>
              <button
                className={`sessions-tab ${sessionsViewMode === "all" ? "active" : ""}`}
                onClick={() => setSessionsViewMode("all")}
              >
                <span>📋</span>
                <span>All History ({loginHistory.length})</span>
              </button>
            </div>

            <div className="sessions-modal-body">
              {loadingSessions ? (
                <div className="sessions-loading">
                  <LoadingSpinner message="Loading sessions…" variant="default" />
                </div>
              ) : (
                <>
                  {sessionsViewMode === "active" ? (
                    <>
                      {sessions.length === 0 ? (
                        <div className="sessions-empty">
                          <EmptyState message="No active sessions. All sessions may have been revoked or expired." iconName="tray" />
                        </div>
                      ) : (
                        <>
                          <div className="sessions-info">
                            <div className="sessions-summary">
                              <div className="summary-icon">🖥️</div>
                              <div className="summary-text">
                                <p className="summary-title">Active Sessions</p>
                                <p className="summary-count">
                                  You're signed in on <strong>{sessions.length}</strong> device{sessions.length > 1 ? "s" : ""}
                                </p>
                              </div>
                            </div>
                            <div className="sessions-actions">
                              <button
                                className="refresh-sessions-btn"
                                onClick={handleViewSessions}
                                disabled={isLoading}
                                title="Refresh sessions"
                              >
                                <span>🔄</span>
                                <span>Refresh</span>
                              </button>
                              {sessions.filter((s) => !s.isCurrent).length > 0 && (
                                <button
                                  className="revoke-all-btn"
                                  onClick={handleRevokeAllSessions}
                                  disabled={isLoading}
                                >
                                  <span>🚫</span>
                                  <span>Revoke All Others</span>
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="sessions-list">
                            {sessions.map((sessionRaw) => {
                      const session = sessionRaw as Record<string, unknown> & {
                        id: string;
                        device: string;
                        location?: string;
                        ip?: string;
                        lastActive: string;
                        isCurrent?: boolean;
                        createdAt?: string;
                      };
                      const isRecent = isRecentSession(session.lastActive);
                      return (
                        <div
                          key={session.id}
                          className={`session-item ${session.isCurrent ? "current" : ""} ${isRecent ? "recent" : ""}`}
                        >
                          <div className="session-icon-wrapper">
                            <div className="session-device-icon">{getDeviceIcon(session.device)}</div>
                            <div className="session-browser-icon">{getBrowserIcon(session.device)}</div>
                          </div>
                          <div className="session-info">
                            <div className="session-header">
                            <div className="session-title-group">
                              <h4>{session.device}</h4>
                              {session.isCurrent && (
                                <span className="current-badge">
                                  <span className="ping-indicator ping-green"></span>
                                  <span>Current Session</span>
                                </span>
                              )}
                              {isRecent && !session.isCurrent && (
                                <span className="recent-badge">
                                  <span className="ping-indicator ping-green"></span>
                                  <span>Active</span>
                                </span>
                              )}
                              {!isRecent && !session.isCurrent && (
                                <span className="inactive-badge">
                                  <span className="ping-indicator ping-red"></span>
                                  <span>Inactive</span>
                                </span>
                              )}
                            </div>
                            </div>
                            <div className="session-details">
                              <div className="session-detail">
                                <span className="detail-icon">📍</span>
                                <span className="detail-text">
                                  <span className="detail-label">Location:</span> {session.location || "Location unavailable"}
                                </span>
                              </div>
                              <div className="session-detail">
                                <span className="detail-icon">🌐</span>
                                <span className="detail-text">
                                  <span className="detail-label">IP address:</span> {session.ip || "Unknown IP"}
                                </span>
                              </div>
                              {session.createdAt && (
                                <div className="session-detail">
                                  <span className="detail-icon">🔐</span>
                                  <span className="detail-text">
                                    <span className="detail-label">Logged in:</span> {formatFullDateTime(session.createdAt)}
                                  </span>
                                </div>
                              )}
                              <div className="session-detail">
                                <span className="detail-icon">🕒</span>
                                <span className="detail-text">
                                  <span className="detail-label">Last active:</span> <AutoTimeDisplay dateString={session.lastActive} />
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="session-actions">
                            {!session.isCurrent && (
                              <button
                                className="revoke-session-btn"
                                onClick={() => handleRevokeSession(session.id)}
                                disabled={isLoading}
                                title="Revoke this session"
                              >
                                <span>✕</span>
                                <span>Revoke</span>
                              </button>
                            )}
                            {session.isCurrent && (
                              <div className="current-indicator">
                                <span>✓</span>
                                <span>Active</span>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                    <>
                      {loginHistory.length === 0 ? (
                        <div className="sessions-empty">
                          <EmptyState message="No login history yet. Past sign-ins will appear here." iconName="doc" />
                        </div>
                      ) : (
                        <>
                          <div className="sessions-info">
                            <div className="sessions-summary">
                              <div className="summary-icon">📊</div>
                              <div className="summary-text">
                                <p className="summary-title">Login History</p>
                                <p className="summary-count">
                                  <strong>{loginHistory.filter((l: Record<string, unknown>) => !l.isExpired && new Date(l.expiresAt as string) > new Date()).length}</strong> active • <strong>{loginHistory.length}</strong> total
                                </p>
                              </div>
                            </div>
                            <div className="sessions-actions">
                              <button
                                className="refresh-sessions-btn"
                                onClick={handleViewSessions}
                                disabled={isLoading}
                                title="Refresh history"
                              >
                                <span>🔄</span>
                                <span>Refresh</span>
                              </button>
                            </div>
                          </div>

                          <div className="sessions-list">
                            {loginHistory.slice(0, 20).map((loginRaw) => {
                              const login = loginRaw as Record<string, unknown> & {
                                id: string;
                                device: string;
                                location?: string;
                                ip?: string;
                                createdAt: string;
                                lastActive: string;
                                expiresAt: string;
                                loggedOutAt?: string;
                                isExpired?: boolean;
                                isCurrent?: boolean;
                              };
                              const isExpired = login.isExpired || new Date(login.expiresAt) < new Date();
                              const isActive = !isExpired && login.isCurrent;
                              return (
                                <div
                                  key={login.id}
                                  className={`session-item ${login.isCurrent ? "current" : ""} ${isExpired ? "expired" : ""} ${isActive ? "active" : ""}`}
                                >
                                  <div className="session-icon-wrapper">
                                    <div className="session-device-icon">{getDeviceIcon(login.device)}</div>
                                    <div className="session-browser-icon">{getBrowserIcon(login.device)}</div>
                                  </div>
                                  <div className="session-info">
                                    <div className="session-header">
                                      <div className="session-title-group">
                                        <h4>{login.device}</h4>
                                        {login.isCurrent && (
                                          <span className="current-badge">
                                            <span className="ping-indicator ping-green"></span>
                                            <span>Current Session</span>
                                          </span>
                                        )}
                                        {isExpired && !login.isCurrent && (
                                          <span className="inactive-badge">
                                            <span className="ping-indicator ping-red"></span>
                                            <span>Expired</span>
                                          </span>
                                        )}
                                        {!isExpired && !login.isCurrent && (
                                          <span className="recent-badge">
                                            <span className="ping-indicator ping-green"></span>
                                            <span>Active</span>
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                    <div className="session-details">
                                      <div className="session-detail">
                                        <span className="detail-icon">📍</span>
                                        <span className="detail-text">
                                          <span className="detail-label">Location:</span> {login.location && !login.location.toString().match(/^\d+\.\d+\.\d+\.\d+$|^[0-9a-fA-F:]+$/) ? login.location : login.location ? "Local Network" : "Location unavailable"}
                                        </span>
                                      </div>
                                      <div className="session-detail">
                                        <span className="detail-icon">🌐</span>
                                        <span className="detail-text">
                                          <span className="detail-label">IP address:</span> {login.ip || "Unknown IP"}
                                        </span>
                                      </div>
                                      <div className="session-detail">
                                        <span className="detail-icon">🔐</span>
                                        <span className="detail-text">
                                          <span className="detail-label">Logged in:</span> {formatFullDateTime(login.createdAt)}
                                        </span>
                                      </div>
                                      {!isExpired ? (
                                        <div className="session-detail">
                                          <span className="detail-icon">🕒</span>
                                          <span className="detail-text">
                                            <span className="detail-label">Last active:</span> <AutoTimeDisplay dateString={login.lastActive} />
                                          </span>
                                        </div>
                                      ) : (
                                        <>
                                          {login.loggedOutAt ? (
                                            <div className="session-detail">
                                              <span className="detail-icon">🚪</span>
                                              <span className="detail-text">
                                                <span className="detail-label">Logged out:</span> {formatFullDateTime(login.loggedOutAt)}
                                              </span>
                                            </div>
                                          ) : (
                                            <div className="session-detail">
                                              <span className="detail-icon">⏱️</span>
                                              <span className="detail-text">
                                                <span className="detail-label">Expired:</span> {formatFullDateTime(login.expiresAt)}
                                              </span>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="session-actions">
                                    {!login.isCurrent && !isExpired && (
                                      <button
                                        className="revoke-session-btn"
                                        onClick={() => handleRevokeSession(login.id)}
                                        disabled={isLoading}
                                        title="Revoke this session"
                                      >
                                        <span>✕</span>
                                        <span>Revoke</span>
                                      </button>
                                    )}
                                    {login.isCurrent && (
                                      <div className="current-indicator">
                                        <span>✓</span>
                                        <span>Active</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                          {loginHistory.length > 20 && (
                            <div className="sessions-footer">
                              <p className="sessions-more">Showing 20 of {loginHistory.length} logins</p>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
