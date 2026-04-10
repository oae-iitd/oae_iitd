import { startTransition, useEffect, useRef, useState } from 'react';
import './ViewUserModal.css';
import type { User } from '../../services/user/user.service';
import {
  getBlobAuthenticated,
  isImageFile,
  isPdfFile,
  type StorageCategory,
} from '../../utils/authFileAccess';

const KNOWN_HOSTELS = new Set([
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
]);

function formatHostelDisplay(hostel: string | undefined): string {
  if (!hostel) return "-";
  if (KNOWN_HOSTELS.has(hostel)) {
    return hostel === "Not, Day Scholar" ? "Day Scholar" : hostel;
  }
  return `Day Scholar: ${hostel}`;
}

const PROOF_LABELS: Record<string, string> = {
  aadhaar: 'Aadhaar Card',
  pan: 'PAN Card',
  voter: 'Voter Card',
  driverLicense: 'Driver License',
  passport: 'Passport',
};

function getProofTypeLabel(type: string | undefined): string {
  if (!type) return 'Not provided';
  return PROOF_LABELS[type] ?? type;
}

export interface ViewUserModalProps {
  user: User;
  onClose: () => void;
  registrationReview?: {
    approvalStatus: string;
    approvalReason?: string;
    createdAt?: string;
  };
}

const ViewUserModal = ({ user, onClose, registrationReview }: ViewUserModalProps) => {
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [pdfUrls, setPdfUrls] = useState<Record<string, string>>({});
  const [loadErrors, setLoadErrors] = useState<Record<string, boolean>>({});
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    startTransition(() => {
      setImageUrls({});
      setPdfUrls({});
      setLoadErrors({});
    });

    const trackBlob = (blobUrl: string) => {
      blobUrlsRef.current.push(blobUrl);
    };

    const loadBlob = async (stateKey: string, raw: string | undefined, category: StorageCategory) => {
      if (!raw?.trim()) return;
      try {
        const blob = await getBlobAuthenticated(raw, category);
        const blobUrl = URL.createObjectURL(blob);
        trackBlob(blobUrl);
        return blobUrl;
      } catch (error) {
        console.error(`[ViewUserModal] Failed to load ${stateKey}:`, error);
        setLoadErrors((prev) => ({ ...prev, [stateKey]: true }));
        return undefined;
      }
    };

    const run = async () => {
      if (user.profilePicture?.trim() && isImageFile(user.profilePicture)) {
        const b = await loadBlob('profile', user.profilePicture, 'profile');
        if (b) setImageUrls((prev) => ({ ...prev, profile: b }));
      }

      if (user.disabilityCertificate?.trim()) {
        if (isImageFile(user.disabilityCertificate)) {
          const b = await loadBlob('certificate', user.disabilityCertificate, 'certificate');
          if (b) setImageUrls((prev) => ({ ...prev, certificate: b }));
        } else if (isPdfFile(user.disabilityCertificate)) {
          const b = await loadBlob('certificatePdf', user.disabilityCertificate, 'certificate');
          if (b) setPdfUrls((prev) => ({ ...prev, certificate: b }));
        }
      }

      if (user.idProofDocument?.trim()) {
        if (isImageFile(user.idProofDocument)) {
          const b = await loadBlob('idProof', user.idProofDocument, 'document');
          if (b) setImageUrls((prev) => ({ ...prev, idProof: b }));
        } else if (isPdfFile(user.idProofDocument)) {
          const b = await loadBlob('idProofPdf', user.idProofDocument, 'document');
          if (b) setPdfUrls((prev) => ({ ...prev, idProof: b }));
        }
      }
    };

    void run();

    return () => {
      blobUrlsRef.current.forEach((u) => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
    };
  }, [user]);

  const openPdfInNewTab = async (raw: string | undefined, category: StorageCategory) => {
    if (!raw?.trim()) return;
    try {
      const blob = await getBlobAuthenticated(raw, category);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } catch (error) {
      console.error('Error opening PDF:', error);
      alert('Failed to open PDF. Please try again.');
    }
  };

  const roleLo = (user.role || '').toLowerCase();
  const isStudent = roleLo === 'student';
  const isDriver = roleLo === 'driver';
  const showProfilePictureSection = ['student', 'driver', 'admin', 'superadmin'].includes(roleLo);

  const certIsImage = !!user.disabilityCertificate?.trim() && isImageFile(user.disabilityCertificate);
  const certIsPdf = !!user.disabilityCertificate?.trim() && isPdfFile(user.disabilityCertificate);
  const idIsImage = !!user.idProofDocument?.trim() && isImageFile(user.idProofDocument);
  const idIsPdf = !!user.idProofDocument?.trim() && isPdfFile(user.idProofDocument);

  return (
    <div className="view-modal-overlay" onClick={onClose}>
      <div className="view-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="view-modal-header">
          <h2>View User - {user.name || user.username}</h2>
          <button className="view-modal-close-btn" onClick={onClose} title="Close" type="button">
            ×
          </button>
        </div>

        <div className="view-modal-body">
          {registrationReview ? (
            <div className="view-modal-section">
              <h3 className="view-modal-section-title">Registration review</h3>
              <div className="view-modal-info-grid">
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Approval status</span>
                  <span className="view-modal-info-value" style={{ textTransform: "capitalize" }}>
                    {registrationReview.approvalStatus || "pending"}
                  </span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Reason</span>
                  <span className="view-modal-info-value">{registrationReview.approvalReason?.trim() || "—"}</span>
                </div>
                {registrationReview.createdAt ? (
                  <div className="view-modal-info-item">
                    <span className="view-modal-info-label">Registered</span>
                    <span className="view-modal-info-value">
                      {new Date(registrationReview.createdAt).toLocaleString()}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="view-modal-section">
            <h3 className="view-modal-section-title">Basic Information</h3>
            <div className="view-modal-info-grid">
              <div className="view-modal-info-item">
                <span className="view-modal-info-label">Name</span>
                <span className="view-modal-info-value">{user.name || "-"}</span>
              </div>
              <div className="view-modal-info-item">
                <span className="view-modal-info-label">Username</span>
                <span className="view-modal-info-value">{user.username || "-"}</span>
              </div>
              <div className="view-modal-info-item">
                <span className="view-modal-info-label">Email</span>
                <span className="view-modal-info-value">{user.email || "-"}</span>
              </div>
              <div className="view-modal-info-item">
                <span className="view-modal-info-label">Phone</span>
                <span className="view-modal-info-value">{user.phone || "-"}</span>
              </div>
              <div className="view-modal-info-item">
                <span className="view-modal-info-label">Role</span>
                <span className="view-modal-info-value view-modal-info-value--badge">
                  <span className={`role-badge role-${roleLo}`}>{user.role || "-"}</span>
                </span>
              </div>
              <div className="view-modal-info-item">
                <span className="view-modal-info-label">Status</span>
                <span className="view-modal-info-value view-modal-info-value--badge">
                  <span className={`status-badge status-${(user.status || "active").toLowerCase()}`}>
                    {user.status || "active"}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {isStudent && (
            <div className="view-modal-section">
              <h3 className="view-modal-section-title">Institution Details</h3>
              <div className="view-modal-info-grid">
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Entry Number</span>
                  <span className="view-modal-info-value">{user.enrollmentNumber || "-"}</span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Programme</span>
                  <span className="view-modal-info-value">{user.programme || "-"}</span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Course</span>
                  <span className="view-modal-info-value">{user.course || "-"}</span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Year</span>
                  <span className="view-modal-info-value">{user.year || "-"}</span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Hostel/Day Scholar Address</span>
                  <span className="view-modal-info-value">{formatHostelDisplay(user.hostel)}</span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Expiry Date</span>
                  <span className="view-modal-info-value">
                    {user.expiryDate ? new Date(user.expiryDate).toLocaleDateString() : "-"}
                  </span>
                </div>
              </div>
            </div>
          )}

          {showProfilePictureSection && (
            <div className="view-modal-section">
              <h3 className="view-modal-section-title">Profile Picture</h3>
              {user.profilePicture ? (
                <div className="view-modal-image-container">
                  {loadErrors.profile ? (
                    <p className="view-modal-empty-state">
                      Failed to load image. If this registration was created before file uploads were enabled, only the file name was saved—ask the student to re-submit documents, or replace files from the admin Users screen.
                    </p>
                  ) : imageUrls.profile ? (
                    <img src={imageUrls.profile} alt="Profile" className="view-modal-image" />
                  ) : isImageFile(user.profilePicture) ? (
                    <p className="view-modal-empty-state">Loading preview…</p>
                  ) : (
                    <p className="view-modal-empty-state">No image preview (unsupported file type).</p>
                  )}
                </div>
              ) : (
                <p className="view-modal-empty-state">No profile picture uploaded</p>
              )}
            </div>
          )}

          {isStudent && (
            <div className="view-modal-section">
              <h3 className="view-modal-section-title">Disability Information</h3>
              <div className="view-modal-info-grid">
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Disability Type</span>
                  <span className="view-modal-info-value">{user.disabilityType || "-"}</span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">Disability Percentage</span>
                  <span className="view-modal-info-value">
                    {user.disabilityPercentage !== undefined && user.disabilityPercentage !== null
                      ? `${user.disabilityPercentage}%`
                      : "-"}
                  </span>
                </div>
                <div className="view-modal-info-item">
                  <span className="view-modal-info-label">UDID Number</span>
                  <span className="view-modal-info-value">{user.udidNumber || "-"}</span>
                </div>
              </div>
            </div>
          )}

          {isStudent && (
            <div className="view-modal-section">
              <h3 className="view-modal-section-title">Disability Certificate</h3>
              {user.disabilityCertificate ? (
                <div>
                  {certIsImage ? (
                    <div className="view-modal-image-container">
                      {loadErrors.certificate ? (
                        <p className="view-modal-empty-state">Failed to load image</p>
                      ) : imageUrls.certificate ? (
                        <img src={imageUrls.certificate} alt="Disability Certificate" className="view-modal-image" />
                      ) : (
                        <p className="view-modal-empty-state">Loading preview…</p>
                      )}
                    </div>
                  ) : certIsPdf ? (
                    <div>
                      {loadErrors.certificatePdf ? (
                        <p className="view-modal-empty-state">Failed to load PDF preview</p>
                      ) : pdfUrls.certificate ? (
                        <iframe
                          title="Disability certificate PDF"
                          src={pdfUrls.certificate}
                          className="view-modal-pdf-frame"
                        />
                      ) : (
                        <p className="view-modal-empty-state">Loading PDF preview…</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void openPdfInNewTab(user.disabilityCertificate, 'certificate')}
                        className="view-modal-pdf-btn view-modal-pdf-btn--spaced"
                      >
                        Open PDF in new tab
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openPdfInNewTab(user.disabilityCertificate, 'certificate')}
                      className="view-modal-pdf-btn"
                    >
                      Open file
                    </button>
                  )}
                </div>
              ) : (
                <p className="view-modal-empty-state">No disability certificate uploaded</p>
              )}
            </div>
          )}

          {(isStudent || isDriver) && (
            <div className="view-modal-section">
              <h3 className="view-modal-section-title">ID Proof ({getProofTypeLabel(user.idProofType)})</h3>
              {user.idProofDocument ? (
                <div>
                  {idIsImage ? (
                    <div className="view-modal-image-container">
                      {loadErrors.idProof ? (
                        <p className="view-modal-empty-state">Failed to load image</p>
                      ) : imageUrls.idProof ? (
                        <img src={imageUrls.idProof} alt="ID Proof" className="view-modal-image" />
                      ) : (
                        <p className="view-modal-empty-state">Loading preview…</p>
                      )}
                    </div>
                  ) : idIsPdf ? (
                    <div>
                      {loadErrors.idProofPdf ? (
                        <p className="view-modal-empty-state">Failed to load PDF preview</p>
                      ) : pdfUrls.idProof ? (
                        <iframe
                          title="ID proof PDF"
                          src={pdfUrls.idProof}
                          className="view-modal-pdf-frame"
                        />
                      ) : (
                        <p className="view-modal-empty-state">Loading PDF preview…</p>
                      )}
                      <button
                        type="button"
                        onClick={() => void openPdfInNewTab(user.idProofDocument, 'document')}
                        className="view-modal-pdf-btn view-modal-pdf-btn--spaced"
                      >
                        Open PDF in new tab
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void openPdfInNewTab(user.idProofDocument, 'document')}
                      className="view-modal-pdf-btn"
                    >
                      Open file
                    </button>
                  )}
                </div>
              ) : (
                <p className="view-modal-empty-state">No ID proof document uploaded</p>
              )}
            </div>
          )}
        </div>

        <div className="view-modal-footer">
          <button type="button" className="view-modal-close-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ViewUserModal;
