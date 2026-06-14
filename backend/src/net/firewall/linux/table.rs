use crate::iptables::types::*;
use once_cell::sync::Lazy;
use regex::Regex;

static SYSTEM_TITLE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"Chain (.+) \(policy (.+) (.+) packets, (.+) bytes\)").unwrap());

static CUSTOM_TITLE_RE: Lazy<Regex> =
    Lazy::new(|| Regex::new(r"Chain (.+) \((\d+) references\)").unwrap());

static COLUMN_RE: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"(\d+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+(.+?)\s+([0-9A-Za-z:\.\/-]+)\s*(.*)").unwrap()
});

pub fn parse_system_title(ts: &str) -> Result<SystemTitle, String> {
    let caps = SYSTEM_TITLE_RE
        .captures(ts)
        .ok_or_else(|| format!("parse system table title error: {}", ts))?;
    Ok(SystemTitle {
        chain: caps[1].to_string(),
        policy: caps[2].to_string(),
        packets: caps[3].to_string(),
        bytes: caps[4].to_string(),
    })
}

pub fn parse_custom_title(ts: &str) -> Result<CustomTitle, String> {
    let caps = CUSTOM_TITLE_RE
        .captures(ts)
        .ok_or_else(|| format!("parse custom table title error: {}", ts))?;
    Ok(CustomTitle {
        chain: caps[1].to_string(),
        references: caps[2].to_string(),
    })
}

pub fn parse_column(lines: &[String]) -> Result<Vec<Column>, String> {
    let mut out = Vec::new();
    for line in lines {
        if line.is_empty() {
            continue;
        }
        let caps = COLUMN_RE
            .captures(line)
            .ok_or_else(|| format!("parse column error: {}", line))?;
        let c = Column {
            num: caps[1].to_string(),
            pkts: caps[2].to_string(),
            bytes: caps[3].to_string(),
            target: caps[4].to_string(),
            prot: caps[5].to_string(),
            opt: caps[6].to_string(),
            r#in: caps[7].to_string(),
            out: caps[8].to_string(),
            source: caps[9].to_string(),
            destination: caps[10].to_string(),
            action: caps
                .get(11)
                .map(|m| m.as_str().to_string())
                .unwrap_or_default(),
        };
        out.push(c);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    const RULE_LIST: &str = r#"Chain PREROUTING (policy ACCEPT 2188 packets, 652K bytes)
num   pkts bytes target     prot opt in     out     source               destination
1       24  1604 DOCKER     all  --  *      *       0.0.0.0/0            0.0.0.0/0            ADDRTYPE match dst-type LOCAL

Chain INPUT (policy ACCEPT 1163 packets, 590K bytes)
num   pkts bytes target     prot opt in     out     source               destination

Chain OUTPUT (policy ACCEPT 11032 packets, 669K bytes)
num   pkts bytes target     prot opt in     out     source               destination
1       31  1860 DOCKER     all  --  *      *       0.0.0.0/0           !127.0.0.0/8          ADDRTYPE match dst-type LOCAL

Chain POSTROUTING (policy ACCEPT 11095 packets, 673K bytes)
num   pkts bytes target     prot opt in     out     source               destination
1        0     0 MASQUERADE  all  --  *      !docker0  172.17.0.0/16        0.0.0.0/0
2      126  7560 MASQUERADE  all  --  *      !br-152b31f15eed  172.19.0.0/16        0.0.0.0/0
3        0     0 MASQUERADE  tcp  --  *      *       172.19.0.8           172.19.0.8           tcp dpt:8083
4        0     0 MASQUERADE  tcp  --  *      *       172.19.0.8           172.19.0.8           tcp dpt:8082
5        0     0 MASQUERADE  tcp  --  *      *       172.19.0.8           172.19.0.8           tcp dpt:8081
6        0     0 MASQUERADE  tcp  --  *      *       172.19.0.9           172.19.0.9           tcp dpt:3306

Chain DOCKER (2 references)
num   pkts bytes target     prot opt in     out     source               destination
1        0     0 RETURN     all  --  docker0 *       0.0.0.0/0            0.0.0.0/0
2        0     0 RETURN     all  --  br-152b31f15eed *       0.0.0.0/0            0.0.0.0/0
3        0     0 DNAT       tcp  --  !br-152b31f15eed *       0.0.0.0/0            0.0.0.0/0            tcp dpt:8083 to:172.19.0.8:8083
4        0     0 DNAT       tcp  --  !br-152b31f15eed *       0.0.0.0/0            0.0.0.0/0            tcp dpt:8082 to:172.19.0.8:8082
5        0     0 DNAT       tcp  --  !br-152b31f15eed *       0.0.0.0/0            0.0.0.0/0            tcp dpt:8081 to:172.19.0.8:8081
6        0     0 DNAT       tcp  --  !br-152b31f15eed *       0.0.0.0/0            0.0.0.0/0            tcp dpt:3306 to:172.19.0.9:3306
"#;

    #[test]
    fn test_parse() {
        let chain_list: Vec<&str> = RULE_LIST.split("\n\n").collect();
        for chain_str in chain_list {
            let chain_info: Vec<&str> = chain_str.split('\n').collect();
            if chain_info.is_empty() {
                continue;
            }
            let title = chain_info[0];
            let _column = if chain_info.len() > 1 {
                chain_info[1]
            } else {
                ""
            };
            println!("{} | {} cols", title, chain_info.len() - 2);
        }
    }

    #[test]
    fn test_parse_system_title() {
        let list = vec![
            "Chain POSTROUTING (policy ACCEPT 11095 packets, 673K bytes)",
            "Chain INPUT (policy ACCEPT 1163 packets, 590K bytes)",
            "Chain OUTPUT (policy ACCEPT 11032 packets, 669K bytes)",
            "Chain POSTROUTING (policy ACCEPT 11095 packets, 673K bytes)",
        ];
        for s in list {
            let title = parse_system_title(s).unwrap();
            println!("{:?}", title);
        }
    }

    #[test]
    fn test_parse_custom_title() {
        let list = vec!["Chain DOCKER (2 references)"];
        for s in list {
            let title = parse_custom_title(s).unwrap();
            println!("{:?}", title);
        }
    }

    #[test]
    fn test_parse_column_match() {
        let line = "1        0     0 MASQUERADE  all  --  *      !docker0  172.17.0.0/16        0.0.0.0/0   aaaaa aaa aaa";
        let caps = COLUMN_RE.captures(line).unwrap();
        println!("{:?}", caps);
        assert_eq!(caps.len(), 12);
    }

    #[test]
    fn test_parse_column_list() {
        let list = vec![
            "2      126  7560 MASQUERADE  all  --  *      !br-152b31f15eed  172.19.0.0/16        0.0.0.0/0  ".to_string(),
            "2      126  7560 MASQUERADE  all  --  *      !br-152b31f15eed  172.19.0.0/16        0.0.0.0/0  ".to_string(),
            "3        0     0 MASQUERADE  tcp  --  *      *       172.19.0.8           172.19.0.8           tcp dpt:8083".to_string(),
        ];
        let cols = parse_column(&list).unwrap();
        println!("{:?}", cols);
    }
}
