#!/usr/bin/env python3
"""
Enrich templates.json with Docker Hub and GitHub metadata.
Fetches pull counts, stars, descriptions, and repo info for each template.
"""

import json
import re
import time
import os
import ssl
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import urlopen, Request
from urllib.error import HTTPError, URLError

TEMPLATES_FILE = Path(__file__).parent.parent / "templates.json"
DOCKER_HUB_API = "https://hub.docker.com/v2/repositories"
GITHUB_API = "https://api.github.com/repos"
REQUEST_DELAY = 0.5  # seconds between requests to avoid rate limits

# SSL context for HTTPS requests
try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()


def make_request(url: str, headers: dict = None) -> dict | None:
    """Make HTTP request and return JSON response."""
    try:
        req = Request(url, headers=headers or {})
        req.add_header("User-Agent", "PortainerTemplatesEnricher/1.0")
        
        # Add GitHub token if available
        if "github.com" in url and os.environ.get("GITHUB_TOKEN"):
            req.add_header("Authorization", f"token {os.environ['GITHUB_TOKEN']}")
        
        with urlopen(req, timeout=10, context=SSL_CONTEXT) as response:
            return json.loads(response.read().decode())
    except HTTPError as e:
        if e.code == 404:
            return None
        print(f"  HTTP {e.code} for {url}")
        return None
    except (URLError, TimeoutError) as e:
        print(f"  Request failed for {url}: {e}")
        return None
    except json.JSONDecodeError:
        return None


def parse_image_name(image: str) -> tuple[str, str, str]:
    """
    Parse Docker image string into (namespace, name, tag).
    Examples:
        nginx:latest -> (library, nginx, latest)
        linuxserver/heimdall -> (linuxserver, heimdall, latest)
        ghcr.io/org/image:v1 -> (None, None, None) - skip non-Docker Hub
    """
    # Skip non-Docker Hub registries
    if any(r in image for r in ["ghcr.io", "gcr.io", "quay.io", "mcr.microsoft.com", "lscr.io"]):
        return None, None, None
    
    # Remove registry prefix if present
    if "/" in image and "." in image.split("/")[0]:
        return None, None, None
    
    # Split tag
    if ":" in image:
        image, tag = image.rsplit(":", 1)
    else:
        tag = "latest"
    
    # Split namespace/name
    if "/" in image:
        namespace, name = image.split("/", 1)
    else:
        namespace, name = "library", image
    
    return namespace, name, tag


def fetch_dockerhub_info(namespace: str, name: str) -> dict | None:
    """Fetch repository info from Docker Hub API."""
    url = f"{DOCKER_HUB_API}/{namespace}/{name}/"
    data = make_request(url)
    
    if not data:
        return None
    
    return {
        "description": data.get("description", ""),
        "star_count": data.get("star_count", 0),
        "pull_count": data.get("pull_count", 0),
        "last_updated": data.get("last_updated", ""),
        "is_official": namespace == "library",
        "hub_url": f"https://hub.docker.com/{'_' if namespace == 'library' else 'r'}/{namespace}/{name}" if namespace != "library" else f"https://hub.docker.com/_/{name}"
    }


def extract_github_repo(dockerhub_data: dict, image: str) -> tuple[str, str] | None:
    """Try to extract GitHub repo from Docker Hub data or image name."""
    # Check Docker Hub description for GitHub links
    desc = dockerhub_data.get("description", "") if dockerhub_data else ""
    
    # Common patterns for GitHub URLs
    patterns = [
        r"github\.com/([^/\s]+)/([^/\s\)\"]+)",
        r"https?://([^/]+)\.github\.io/([^/\s\)\"]+)",
    ]
    
    for pattern in patterns:
        match = re.search(pattern, desc)
        if match:
            owner, repo = match.groups()
            repo = repo.rstrip(".git").rstrip("/")
            return owner, repo
    
    # For linuxserver images, try linuxserver/docker-{name}
    namespace, name, _ = parse_image_name(image)
    if namespace == "linuxserver":
        return "linuxserver", f"docker-{name}"
    
    return None


def fetch_github_info(owner: str, repo: str) -> dict | None:
    """Fetch repository info from GitHub API."""
    url = f"{GITHUB_API}/{owner}/{repo}"
    data = make_request(url)
    
    if not data:
        return None
    
    return {
        "github_url": data.get("html_url", ""),
        "github_stars": data.get("stargazers_count", 0),
        "github_forks": data.get("forks_count", 0),
        "github_issues": data.get("open_issues_count", 0),
        "github_updated": data.get("updated_at", ""),
        "github_description": data.get("description", ""),
        "github_license": data.get("license", {}).get("spdx_id") if data.get("license") else None
    }


def format_number(n: int) -> str:
    """Format large numbers with K/M suffix."""
    if n >= 1_000_000:
        return f"{n/1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n/1_000:.1f}K"
    return str(n)


def enrich_template(template: dict) -> dict:
    """Add metadata to a single template."""
    image = template.get("image", "")
    if not image:
        return template
    
    namespace, name, tag = parse_image_name(image)
    if not namespace:
        return template
    
    print(f"  Fetching: {namespace}/{name}")
    
    # Fetch Docker Hub info
    dockerhub = fetch_dockerhub_info(namespace, name)
    time.sleep(REQUEST_DELAY)
    
    metadata = {}
    
    if dockerhub:
        metadata["docker"] = {
            "pulls": dockerhub["pull_count"],
            "pulls_formatted": format_number(dockerhub["pull_count"]),
            "stars": dockerhub["star_count"],
            "hub_url": dockerhub["hub_url"],
            "last_updated": dockerhub["last_updated"],
            "is_official": dockerhub["is_official"]
        }
        
        # Use Docker Hub description if template doesn't have one
        if dockerhub["description"] and not template.get("description"):
            template["description"] = dockerhub["description"]
    
    # Try to find and fetch GitHub info
    github_repo = extract_github_repo(dockerhub, image)
    if github_repo:
        owner, repo = github_repo
        github = fetch_github_info(owner, repo)
        time.sleep(REQUEST_DELAY)
        
        if github:
            metadata["github"] = {
                "url": github["github_url"],
                "stars": github["github_stars"],
                "forks": github["github_forks"],
                "issues": github["github_issues"],
                "updated": github["github_updated"],
                "license": github["github_license"]
            }
    
    if metadata:
        template["metadata"] = metadata
    
    return template


def main():
    """Main enrichment process."""
    print(f"Loading templates from {TEMPLATES_FILE}")
    
    with open(TEMPLATES_FILE, "r") as f:
        data = json.load(f)
    
    templates = data.get("templates", [])
    total = len(templates)
    print(f"Found {total} templates to process\n")
    
    enriched_count = 0
    
    for i, template in enumerate(templates, 1):
        title = template.get("title", template.get("name", "Unknown"))
        print(f"[{i}/{total}] {title}")
        
        try:
            enriched = enrich_template(template)
            if "metadata" in enriched:
                enriched_count += 1
                templates[i-1] = enriched
        except Exception as e:
            print(f"  Error: {e}")
            continue
    
    # Add enrichment timestamp
    data["enriched_at"] = datetime.now(timezone.utc).isoformat()
    data["templates"] = templates
    
    # Write back
    print(f"\nWriting enriched data back to {TEMPLATES_FILE}")
    with open(TEMPLATES_FILE, "w") as f:
        json.dump(data, f, indent=2)
    
    print(f"\nDone! Enriched {enriched_count}/{total} templates")


if __name__ == "__main__":
    main()
