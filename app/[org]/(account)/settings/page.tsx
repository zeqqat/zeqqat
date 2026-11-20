import { requireWorkspace } from "../../../../lib/guard";

// The account's own settings. Your personal account's name and username
// are your profile's, edited on /account.
export default async function AccountSettingsPage() {
  const { user, ws } = await requireWorkspace();
  const personal = ws.organizationKind === "personal" && ws.orgRole === "owner";
  return (
    <div className="zq-acc-set">
      <div className="r">
        Name <span>{personal ? user.name : ws.organizationName}</span>
      </div>
      <div className="r">
        Username <span>@{ws.organizationSlug}</span>
      </div>
      {personal && (
        <div className="r">
          Profile
          <a className="zq-action zq-action-sm" href="/account">
            Edit
          </a>
        </div>
      )}
    </div>
  );
}
