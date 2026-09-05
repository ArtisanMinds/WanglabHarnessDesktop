//! About 对话框信息：版本来自编译常量，发布时间来自 Wanglab 更新清单。

use super::meta::fetch_releases_meta;
use super::version::current_version;
use super::{COPYRIGHT, POWERED_BY, REPO_URL};

/// 关于对话框信息。
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopAboutInfo {
    pub version: String,
    pub published_at: String,
    pub copyright: String,
    pub repo: String,
    pub powered_by: String,
}

/// 只采用当前版本的发布日期；离线时使用随安装包保存的构建时间。
pub async fn about() -> DesktopAboutInfo {
    let published_at = fetch_releases_meta()
        .await
        .ok()
        .and_then(|releases| {
            releases.into_iter().find_map(|(tag, published)| {
                (tag.trim_start_matches("wanglab-").trim_start_matches('v') == current_version()
                    && !published.is_empty())
                .then_some(published)
            })
        })
        .unwrap_or_else(build_date);
    DesktopAboutInfo {
        version: current_version(),
        published_at,
        copyright: COPYRIGHT.to_string(),
        repo: REPO_URL.to_string(),
        powered_by: POWERED_BY.to_string(),
    }
}

fn build_date() -> String {
    let timestamp = env!("WANGLAB_BUILD_TIMESTAMP")
        .parse::<i64>()
        .expect("build timestamp");
    time::OffsetDateTime::from_unix_timestamp(timestamp)
        .expect("valid build timestamp")
        .format(&time::format_description::well_known::Rfc3339)
        .expect("build date")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn about_serialization_matches_the_frontend_contract() {
        let info = DesktopAboutInfo {
            version: current_version(),
            published_at: build_date(),
            copyright: COPYRIGHT.into(),
            repo: REPO_URL.into(),
            powered_by: POWERED_BY.into(),
        };
        let json = serde_json::to_value(info).unwrap();
        assert!(!json["publishedAt"].as_str().unwrap().is_empty());
        assert_eq!(json["poweredBy"], POWERED_BY);
    }
}
