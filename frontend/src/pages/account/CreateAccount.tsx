import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api";
import { portal } from "../../portalTheme";
import {
  AuthLayout,
  CardTitle,
  Field,
  Label,
  PrimaryButton,
  SelectField,
} from "../../components/portal/ui";

export function CreateAccount() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    age: "",
    gender: "",
    phone: "",
    email: "",
    password: "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const fieldError = (k: string) => errors[k]?.[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      await api.register({
        first_name: form.first_name,
        last_name: form.last_name,
        age: Number(form.age),
        gender: form.gender,
        phone: form.phone,
        email: form.email,
        password: form.password,
      });
      // Account created → log in to continue (matches the design flow).
      navigate("/login", { state: { justRegistered: true, identifier: form.email } });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setErrors(err.fields);
      } else {
        setFormError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
            Log in
          </Link>
        </>
      }
    >
      <CardTitle>Create your aspirant account</CardTitle>
      <form onSubmit={submit} noValidate>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field
            label="First name"
            required
            placeholder="Wanjiru"
            value={form.first_name}
            onChange={set("first_name")}
            error={fieldError("first_name")}
          />
          <Field
            label="Last name"
            required
            placeholder="Kamau"
            value={form.last_name}
            onChange={set("last_name")}
            error={fieldError("last_name")}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: 12 }}>
          <Field
            label="Age"
            required
            type="number"
            min={18}
            max={100}
            placeholder="35"
            value={form.age}
            onChange={set("age")}
            error={fieldError("age")}
          />
          <SelectField
            label="Gender"
            required
            value={form.gender}
            onChange={set("gender")}
            error={fieldError("gender")}
          >
            <option value="">Select</option>
            <option value="Female">Female</option>
            <option value="Male">Male</option>
            <option value="Other / prefer not to say">Other / prefer not to say</option>
          </SelectField>
        </div>

        <Field
          label="Phone number"
          required
          placeholder="+254 7xx xxx xxx"
          value={form.phone}
          onChange={set("phone")}
          error={fieldError("phone")}
          hint="Every log-in code is sent to this number."
        />

        <Field
          label="Email address"
          required
          type="email"
          placeholder="you@example.com"
          value={form.email}
          onChange={set("email")}
          error={fieldError("email")}
          hint="You'll verify this from the setup guide after your first log-in."
        />

        <div style={{ marginBottom: 20 }}>
          <Label required>Password</Label>
          <Field
            type="password"
            placeholder="At least 10 characters"
            value={form.password}
            onChange={set("password")}
            error={fieldError("password")}
            style={{ marginBottom: 0 }}
          />
        </div>

        {formError && (
          <div style={{ fontSize: 12, color: portal.dangerText, marginBottom: 12 }}>{formError}</div>
        )}

        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Creating…" : "Create account"}
        </PrimaryButton>
        <div
          style={{
            fontSize: 12,
            color: portal.textSubtle,
            marginTop: 16,
            textAlign: "center",
            lineHeight: "16px",
          }}
        >
          By creating an account you agree to the Mtazamo terms and to campaign data being handled
          under the Data Protection Act, 2019.
        </div>
      </form>
    </AuthLayout>
  );
}
