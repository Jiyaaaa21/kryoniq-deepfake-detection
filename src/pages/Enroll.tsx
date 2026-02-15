import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, Building, Phone, Shield, Check } from 'lucide-react';
import ParticleBackground from '@/components/ParticleBackground';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

const Enroll = () => {
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    phone: ''
  });

  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const isValid =
    form.name.trim() &&
    emailValid &&
    form.organization.trim() &&
    consent;

  const validate = () => {
    const e: Record<string, string> = {};

    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!emailValid) e.email = 'Invalid email format';
    if (!form.organization.trim()) e.organization = 'Organization is required';
    if (!consent) e.consent = 'Consent is required';

    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ name: true, email: true, organization: true, consent: true });

    if (!validate()) return;

    if (loading) return;

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/create-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim().toLowerCase(),
          organization: form.organization.trim(),
          phone: form.phone.trim() || null,
          consent: true,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Registration failed");
      }

      navigate('/game', {
        state: {
          userId: data.userId,
          userName: form.name,
          userEmail: form.email,
          userOrganization: form.organization,
          userPhone: form.phone,
        },
      });

    } catch (error: any) {
      console.error("Enrollment Error:", error);
      alert(error.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleBlur = (field: string) => {
    setTouched((t) => ({ ...t, [field]: true }));
    validate();
  };

  const fieldOk = (field: string) =>
    touched[field] &&
    !errors[field] &&
    (form as any)[field]?.trim();

  const fields = [
    { key: 'name', label: 'Full Name', icon: User, type: 'text', required: true },
    { key: 'email', label: 'Email', icon: Mail, type: 'email', required: true },
    { key: 'organization', label: 'Organization', icon: Building, type: 'text', required: true },
    { key: 'phone', label: 'Phone (optional)', icon: Phone, type: 'tel', required: false },
  ];

  return (
    <div className="relative min-h-screen gradient-bg flex items-center justify-center px-4 py-12">
      <ParticleBackground />

      <motion.div
        className="relative z-10 w-full max-w-md"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="glass-card p-8 glow-border">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-lg">Kryoniq</span>
          </div>

          <h2 className="font-display text-2xl font-bold mb-1">
            Let's Get Started
          </h2>

          <p className="text-muted-foreground text-sm mb-6">
            Join the challenge and test your detection skills
          </p>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {fields.map(({ key, label, icon: Icon, type, required }) => (
              <div key={key} className="relative">
                <div className="relative">
                  <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type={type}
                    placeholder={label}
                    required={required}
                    value={(form as any)[key]}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    onBlur={() => handleBlur(key)}
                    className={`w-full pl-10 pr-10 py-3 rounded-xl bg-muted/50 border text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all ${
                      touched[key] && errors[key]
                        ? 'border-destructive'
                        : fieldOk(key)
                        ? 'border-success'
                        : 'border-border'
                    }`}
                  />
                  {fieldOk(key) && (
                    <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-success" />
                  )}
                </div>

                {touched[key] && errors[key] && (
                  <p className="text-destructive text-xs mt-1 ml-1">
                    {errors[key]}
                  </p>
                )}
              </div>
            ))}

            <label className="flex items-start gap-3 cursor-pointer pt-2">
              <button
                type="button"
                role="checkbox"
                aria-checked={consent}
                onClick={() => {
                  setConsent(!consent);
                  setTouched((t) => ({ ...t, consent: true }));
                }}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  consent ? 'bg-primary border-primary' : 'border-muted-foreground'
                }`}
              >
                {consent && (
                  <Check className="w-3 h-3 text-primary-foreground" />
                )}
              </button>
              <span className="text-xs text-muted-foreground leading-relaxed">
                I agree to receive communications from Kryoniq and allow use of my data for research purposes
              </span>
            </label>

            <button
              type="submit"
              disabled={!isValid || loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-semibold text-base disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] transition-transform"
            >
              {loading ? "Creating..." : "Let's Go!"}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
};

export default Enroll;
