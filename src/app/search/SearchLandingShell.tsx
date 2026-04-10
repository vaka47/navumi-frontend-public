import SearchLandingClientShell from "./SearchLandingClientShell";

type SearchLandingShellProps = {
  heading: string;
  description?: string;
  queryString?: string;
};

export default function SearchLandingShell({ heading, description, queryString }: SearchLandingShellProps) {
  return (
    <div>
      <SearchLandingClientShell queryString={queryString} />
    </div>
  );
}
